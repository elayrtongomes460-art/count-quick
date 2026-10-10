import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Camera, CheckCircle2, Download, Image as ImageIcon,
  Loader2, RotateCcw, Save, Scan, X, Zap, ZapOff,
} from "lucide-react";
import { toast } from "sonner";

import { detectLocal } from "@/lib/ai/local-engine";
import { preprocessImage, type PreprocessOutput } from "@/lib/ai/preprocessing";
import { DetectionOverlay } from "@/lib/ai/overlay";
import { renderAnnotatedImage, downloadBlob } from "@/lib/ai/export";
import {
  PIECE_LIST, PIECE_PROFILES, newMarkerId,
  type Marker, type PieceType, type ProgressEvent,
} from "@/lib/ai/types";

type Search = { inventario?: string; produto?: string };

export const Route = createFileRoute("/_authenticated/contagem-ia")({
  head: () => ({ meta: [{"title": "Contagem por IA — Inventário"}, {"name": "description", "content": "Contagem local de materiais com revisão dos marcadores e quantidades."}, {"property": "og:title", "content": "Contagem por IA — Inventário"}, {"property": "og:description", "content": "Contagem local de materiais com revisão dos marcadores e quantidades."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: ContagemIA,
  validateSearch: (s: Record<string, unknown>): Search => ({
    inventario: typeof s.inventario === "string" ? s.inventario : undefined,
    produto: typeof s.produto === "string" ? s.produto : undefined,
  }),
});

type Phase = "setup" | "processing" | "review" | "saving";

function ContagemIA() {
  const { inventario, produto: produtoParam } = Route.useSearch();
  const navigate = useNavigate();

  // --- camera ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const galRef = useRef<HTMLInputElement | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);

  // --- selection ---
  const [pieceType, setPieceType] = useState<PieceType>("parafuso");
  const [produto, setProduto] = useState(produtoParam ?? "");
  const [partNumber, setPartNumber] = useState("");
  const [observacao, setObservacao] = useState("");
  const [qtdEsperada, setQtdEsperada] = useState<number | null>(null);
  const [invNome, setInvNome] = useState<string | null>(null);

  // --- pipeline state ---
  const [phase, setPhase] = useState<Phase>("setup");
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const [tempoMs, setTempoMs] = useState<number>(0);
  const [preproc, setPreproc] = useState<PreprocessOutput | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [confianca, setConfianca] = useState(0);
  const [passadas, setPassadas] = useState(0);
  const [divergencia, setDivergencia] = useState(0);
  const [detalhes, setDetalhes] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  const profile = PIECE_PROFILES[pieceType];

  useEffect(() => {
    if (!inventario) return;
    supabase.from("inventarios").select("nome_inventario").eq("id", inventario).single()
      .then(({ data }) => setInvNome(data?.nome_inventario ?? null));
  }, [inventario]);

  useEffect(() => {
    const p = produto.trim();
    if (!p) { setQtdEsperada(null); return; }
    supabase.from("itens").select("part_number, quantidade_un").eq("produto", p).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setQtdEsperada(Number(data.quantidade_un) || 0);
          if (data.part_number) setPartNumber(data.part_number);
        } else setQtdEsperada(null);
      });
  }, [produto]);

  // ---- camera lifecycle ----
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Câmera não suportada neste navegador. Use a Galeria.");
      return;
    }
    const attempts: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false },
      { video: { facingMode: "environment" }, audio: false },
      { video: true, audio: false },
    ];
    let lastErr: unknown = null;
    for (const c of attempts) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setFlashSupported(Boolean(caps.torch));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        return;
      } catch (e) {
        lastErr = e;
      }
    }
    const err = lastErr as { name?: string; message?: string } | null;
    const name = err?.name ?? "";
    const msg =
      name === "NotAllowedError" ? "Permissão da câmera negada. Libere o acesso nas configurações do navegador."
      : name === "NotFoundError" ? "Nenhuma câmera encontrada. Use a Galeria."
      : name === "NotReadableError" ? "Câmera em uso por outro app. Feche-o e tente novamente, ou use a Galeria."
      : name === "OverconstrainedError" ? "Câmera não atende às configurações. Use a Galeria."
      : err?.message || "Não foi possível iniciar a câmera. Use a Galeria como alternativa.";
    toast.error(msg);
  }, []);
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  useEffect(() => {
    if (phase === "setup") startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [phase, startCamera, stopCamera]);

  const toggleFlash = async () => {
    const t = trackRef.current; if (!t || !flashSupported) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !flashOn } as MediaTrackConstraintSet & { torch: boolean }] });
      setFlashOn((v) => !v);
    } catch { toast.error("Flash indisponível"); }
  };

  // ---- pipeline execution ----
  const runPipeline = useCallback(async (source: HTMLVideoElement | Blob) => {
    setPhase("processing");
    setProgress({ step: "resize", label: "Iniciando…", pct: 0 });
    const t0 = performance.now();

    try {
      const pre = await preprocessImage(source, (e) => setProgress(e));
      setPreproc(pre);

      // Inferência 100% local — nenhuma imagem sai do dispositivo.
      const result = await detectLocal(pre.processed.blob, pieceType, (e) => setProgress(e));

      const asMarkers: Marker[] = result.detections.map((d) => ({
        id: newMarkerId(),
        x: d.x, y: d.y, w: d.w, h: d.h,
        confianca: d.confianca,
        source: "ai" as const,
      }));

      setMarkers(asMarkers);
      setConfianca(result.confianca_media);
      setPassadas(result.passadas);
      setDivergencia(result.divergencia);
      setDetalhes(result.detalhes);
      setTempoMs(Math.round(performance.now() - t0));
      setProgress({ step: "done", label: "Concluído", pct: 100 });
      setPhase("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na análise");
      setPhase("setup");
    }
  }, [pieceType]);

  const capture = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { toast.error("Câmera não pronta"); return; }
    // Grab bitmap BEFORE stopping stream (stopping blanks the video element)
    const bmp = await createImageBitmap(v);
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close?.();
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.95)!);
    stopCamera();
    await runPipeline(blob);
  };

  const onGallery = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem"); return; }
    stopCamera();
    await runPipeline(file);
  };

  const reset = () => {
    if (preproc) { URL.revokeObjectURL(preproc.original.url); URL.revokeObjectURL(preproc.processed.url); }
    setPreproc(null); setMarkers([]); setConfianca(0); setPassadas(0);
    setDivergencia(0); setDetalhes(null); setTempoMs(0); setProgress(null);
    setShowOriginal(false);
    setPhase("setup");
  };

  // ---- marker edit ----
  const addMarker = (nx: number, ny: number) =>
    setMarkers((arr) => [...arr, {
      id: newMarkerId(), x: nx, y: ny,
      w: profile.defaultBoxFrac, h: profile.defaultBoxFrac,
      confianca: 1, source: "manual",
    }]);
  const moveMarker = (id: string, nx: number, ny: number) =>
    setMarkers((arr) => arr.map((m) => m.id === id ? { ...m, x: nx, y: ny } : m));
  const removeMarker = (id: string) =>
    setMarkers((arr) => arr.filter((m) => m.id !== id));

  // ---- export ----
  const onDownload = async () => {
    if (!preproc) return;
    try {
      const annotated = await renderAnnotatedImage(preproc.processed.blob, markers);
      downloadBlob(annotated, `contagem-${pieceType}-${Date.now()}.jpg`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar imagem");
    }
  };

  // ---- save ----
  const save = async () => {
    if (!preproc) return;
    setPhase("saving");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const annotated = await renderAnnotatedImage(preproc.processed.blob, markers);
      const path = `${uid}/ia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await supabase.storage.from("contagens-camera").upload(path, annotated, {
        contentType: "image/jpeg", upsert: false,
      });
      if (up.error) throw new Error(`Upload: ${up.error.message}`);
      const { data: signed, error: signErr } = await supabase.storage
        .from("contagens-camera").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw new Error(`URL: ${signErr.message}`);
      const imagem_url = signed?.signedUrl ?? path;

      const total = markers.length;
      const { error } = await supabase.from("contagens_camera").insert({
        user_id: uid,
        inventario_id: inventario ?? null,
        produto: produto || null,
        part_number: partNumber || null,
        observacao: observacao || null,
        imagem_url,
        quantidade_parafusos: pieceType === "parafuso" ? total : 0,
        quantidade_porcas: pieceType === "porca" ? total : 0,
        quantidade_arruelas: pieceType === "arruela" ? total : 0,
        total_itens: total,
        resultado_json: JSON.parse(JSON.stringify({
          modo: "ia_local_v1",
          piece_type: pieceType,
          confianca_media: confianca,
          passadas,
          divergencia,
          tempo_ms: tempoMs,
          quantidade_esperada: qtdEsperada,
          detalhes,
          markers,
        })),
        status_confirmacao: true,
        origem: inventario ? "ia_inventario" : "ia_home",
      });
      if (error) throw new Error(`Salvar: ${error.message}`);
      toast.success("Contagem salva com sucesso.");
      navigate({
        to: inventario ? "/inventario/$id" : "/historico-camera",
        params: inventario ? { id: inventario } : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      setPhase("review");
    }
  };

  const diff = useMemo(() => qtdEsperada !== null ? markers.length - qtdEsperada : null, [markers.length, qtdEsperada]);

  // ================ PROCESSING PHASE ================
  if (phase === "processing") {
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-5">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 bg-accent/20 text-accent px-3 py-1 rounded-full text-xs uppercase tracking-widest">
              <Loader2 className="size-4 animate-spin" /> Processando
            </div>
            <h2 className="mt-3 text-xl font-bold">Analisando {profile.label.toLowerCase()}s</h2>
            <p className="text-sm text-white/60 mt-1">{profile.descricao}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{progress?.label ?? "…"}</span>
              <span className="text-accent font-bold">{progress?.pct ?? 0}%</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress?.pct ?? 0}%` }} />
            </div>
            <p className="text-[11px] text-white/50">Pipeline: correção de iluminação → contraste → nitidez → detecção IA (dupla passagem) → reconciliação.</p>
          </div>
        </div>
      </div>
    );
  }

  // ================ REVIEW / SAVING PHASE ================
  if ((phase === "review" || phase === "saving") && preproc) {
    const displayUrl = showOriginal ? preproc.original.url : preproc.processed.url;
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur z-10">
          <button onClick={reset} className="p-2 -ml-2"><ArrowLeft className="size-6" /></button>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest opacity-60">Revisão</div>
            <div className="text-sm font-semibold">{profile.emoji} {profile.label}</div>
          </div>
          <button
            onClick={() => setShowOriginal((v) => !v)}
            className="text-[11px] bg-white/10 px-2 py-1 rounded-full"
          >
            {showOriginal ? "Processada" : "Original"}
          </button>
        </div>

        <div className="relative flex-1 overflow-hidden bg-black">
          <DetectionOverlay
            imageUrl={displayUrl}
            markers={markers}
            editable
            onAdd={addMarker}
            onMove={moveMarker}
            onRemove={removeMarker}
          />

          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground rounded-2xl px-5 py-2 shadow-xl">
            <div className="text-[10px] uppercase tracking-widest text-center opacity-80">Total</div>
            <div className="text-4xl font-black text-center leading-none">{markers.length}</div>
          </div>

          <div className="absolute top-3 right-3 bg-black/70 rounded-lg px-2.5 py-1.5 text-[11px] space-y-0.5 max-w-[45%]">
            <div className="flex justify-between gap-2"><span className="opacity-70">Confiança</span><b>{Math.round(confianca * 100)}%</b></div>
            <div className="flex justify-between gap-2"><span className="opacity-70">Passadas</span><b>{passadas}</b></div>
            <div className="flex justify-between gap-2"><span className="opacity-70">Tempo</span><b>{(tempoMs / 1000).toFixed(1)}s</b></div>
            {divergencia > 0.15 && (
              <div className="text-amber-300 text-[10px] pt-0.5">Análises divergiram ({Math.round(divergencia * 100)}%) — revise manualmente.</div>
            )}
          </div>
        </div>

        <div className="bg-card text-card-foreground px-4 pt-3 pb-5 space-y-3 max-h-[55vh] overflow-y-auto">
          {qtdEsperada !== null && diff !== null && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Contado" value={String(markers.length)} tone="primary" />
              <Stat label="Esperado" value={String(qtdEsperada)} />
              <Stat
                label="Diferença"
                value={(diff > 0 ? "+" : "") + String(diff)}
                tone={diff === 0 ? "success" : diff > 0 ? "warning" : "danger"}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Field label="Produto" v={produto} onChange={setProduto} />
            <Field label="Part Number" v={partNumber} onChange={setPartNumber} />
            <Field label="Observação" v={observacao} onChange={setObservacao} textarea />
          </div>

          {detalhes && <p className="text-xs italic text-muted-foreground">{detalhes}</p>}

          <p className="text-[11px] text-muted-foreground">
            Toque na imagem para adicionar · toque em uma bolinha para remover · arraste para reposicionar.
          </p>

          <div className="grid grid-cols-3 gap-2">
            <button onClick={reset} className="bg-card border border-border rounded-xl py-3 font-semibold flex items-center justify-center gap-1.5 text-sm">
              <RotateCcw className="size-4" /> Nova
            </button>
            <button onClick={onDownload} className="bg-card border border-border rounded-xl py-3 font-semibold flex items-center justify-center gap-1.5 text-sm">
              <Download className="size-4" /> Baixar
            </button>
            <button onClick={save} disabled={phase === "saving"}
              className="bg-primary text-primary-foreground rounded-xl py-3 font-semibold flex items-center justify-center gap-1.5 text-sm disabled:opacity-60">
              {phase === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================ SETUP / CAMERA PHASE ================
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
        <Link to="/home" className="p-2 -ml-2 bg-black/40 rounded-full"><X className="size-5" /></Link>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest opacity-70">Contagem Inteligente IA</div>
          {invNome && <div className="text-xs font-semibold">{invNome}</div>}
        </div>
        <button onClick={toggleFlash} disabled={!flashSupported}
          className={`p-2 rounded-full ${flashOn ? "bg-accent text-accent-foreground" : "bg-black/40"} disabled:opacity-30`}>
          {flashOn ? <Zap className="size-5" /> : <ZapOff className="size-5" />}
        </button>
      </div>

      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />

      {/* Targeting frame */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="border-2 border-accent/70 rounded-3xl relative" style={{ width: "85%", height: "55%" }}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-px bg-accent/70" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-px bg-accent/70" />
        </div>
      </div>

      {/* Piece type chips */}
      <div className="absolute top-16 left-0 right-0 z-10 px-4">
        <div className="flex gap-2 justify-center overflow-x-auto no-scrollbar">
          {PIECE_LIST.map((p) => (
            <button
              key={p.key}
              onClick={() => setPieceType(p.key)}
              className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                pieceType === p.key
                  ? "bg-accent text-accent-foreground border-accent shadow-lg scale-105"
                  : "bg-black/50 border-white/20 text-white/80"
              }`}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
        <p className="text-center text-[10px] text-white/60 mt-1.5">{profile.descricao}</p>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/95 to-transparent pt-8 pb-6 px-6">
        <div className="mb-3">
          <input
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            placeholder="Código do produto (opcional)"
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-sm outline-none focus:border-accent placeholder:text-white/50"
          />
          {qtdEsperada !== null && (
            <div className="text-xs mt-1 opacity-80 flex items-center gap-1">
              <CheckCircle2 className="size-3 text-accent" /> Estoque atual: <span className="font-semibold">{qtdEsperada}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-around">
          <button onClick={() => galRef.current?.click()} className="flex flex-col items-center gap-1">
            <div className="bg-white/15 rounded-full p-3"><ImageIcon className="size-5" /></div>
            <span className="text-[10px] opacity-80">Galeria</span>
          </button>

          <button
            onClick={capture}
            className="bg-accent text-accent-foreground rounded-full size-20 flex flex-col items-center justify-center shadow-2xl ring-4 ring-white/20 active:scale-95 transition-transform"
          >
            <Scan className="size-8" />
            <span className="text-[9px] font-bold uppercase">Contar</span>
          </button>

          <Link to="/historico-camera" className="flex flex-col items-center gap-1">
            <div className="bg-white/15 rounded-full p-3"><Camera className="size-5" /></div>
            <span className="text-[10px] opacity-80">Histórico</span>
          </Link>
        </div>
      </div>

      <input ref={galRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => onGallery(e.target.files?.[0] ?? null)} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "primary" | "success" | "warning" | "danger" }) {
  const cls =
    tone === "primary" ? "bg-primary text-primary-foreground" :
    tone === "success" ? "bg-emerald-600 text-white" :
    tone === "warning" ? "bg-amber-500 text-black" :
    tone === "danger"  ? "bg-destructive text-destructive-foreground" :
    "bg-muted text-foreground";
  return (
    <div className={`rounded-xl py-2 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xl font-bold leading-tight">{value}</div>
    </div>
  );
}

function Field({ label, v, onChange, textarea }: { label: string; v: string; onChange: (s: string) => void; textarea?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea value={v} onChange={(e) => onChange(e.target.value)} rows={2}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-ring text-foreground" />
      ) : (
        <input value={v} onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-border outline-none focus:border-ring text-foreground" />
      )}
    </label>
  );
}

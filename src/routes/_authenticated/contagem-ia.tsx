import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { detectarObjetos, type Detection } from "@/lib/detection.functions";
import {
  Camera, Loader2, Pause, Play, RotateCcw, Save, Scan, X,
  ZoomIn, ZoomOut, Zap, ZapOff, Plus, Trash2, ArrowLeft, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

type Search = { inventario?: string; produto?: string };

export const Route = createFileRoute("/_authenticated/contagem-ia")({
  component: ContagemIA,
  validateSearch: (s: Record<string, unknown>): Search => ({
    inventario: typeof s.inventario === "string" ? s.inventario : undefined,
    produto: typeof s.produto === "string" ? s.produto : undefined,
  }),
});

type Phase = "camera" | "review" | "saving";

function ContagemIA() {
  const { inventario, produto: produtoParam } = Route.useSearch();
  const navigate = useNavigate();
  const detect = useServerFn(detectarObjetos);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [phase, setPhase] = useState<Phase>("camera");
  const [analyzing, setAnalyzing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });

  const [snapshot, setSnapshot] = useState<{ blob: Blob; url: string; w: number; h: number } | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [classe, setClasse] = useState<string>("");
  const [confianca, setConfianca] = useState<number>(0);
  const [detalhes, setDetalhes] = useState<string | null>(null);
  const [fps, setFps] = useState<number | null>(null);

  const [produto, setProduto] = useState(produtoParam ?? "");
  const [partNumber, setPartNumber] = useState("");
  const [observacao, setObservacao] = useState("");
  const [qtdEsperada, setQtdEsperada] = useState<number | null>(null);
  const [invNome, setInvNome] = useState<string | null>(null);

  // Lookup expected stock when produto is set
  useEffect(() => {
    const p = produto.trim();
    if (!p) { setQtdEsperada(null); setPartNumber((pn) => pn); return; }
    supabase.from("itens").select("part_number, quantidade_un").eq("produto", p).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setQtdEsperada(Number(data.quantidade_un) || 0);
          if (data.part_number) setPartNumber(data.part_number);
        } else setQtdEsperada(null);
      });
  }, [produto]);

  useEffect(() => {
    if (!inventario) return;
    supabase.from("inventarios").select("nome_inventario").eq("id", inventario).single()
      .then(({ data }) => setInvNome(data?.nome_inventario ?? null));
  }, [inventario]);

  // Start camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      trackRef.current = track;
      const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean; zoom?: { min: number; max: number; step: number } };
      setFlashSupported(Boolean(caps.torch));
      if (caps.zoom) {
        setZoomSupported(true);
        setZoomRange({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível acessar a câmera");
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackRef.current = null;
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Flash toggle
  const toggleFlash = useCallback(async () => {
    const t = trackRef.current; if (!t || !flashSupported) return;
    try {
      await t.applyConstraints({ advanced: [{ torch: !flashOn } as MediaTrackConstraintSet & { torch: boolean }] });
      setFlashOn((v) => !v);
    } catch { toast.error("Flash indisponível"); }
  }, [flashOn, flashSupported]);

  const changeZoom = useCallback(async (delta: number) => {
    const t = trackRef.current; if (!t || !zoomSupported) return;
    const next = Math.max(zoomRange.min, Math.min(zoomRange.max, zoom + delta));
    try {
      await t.applyConstraints({ advanced: [{ zoom: next } as MediaTrackConstraintSet & { zoom: number }] });
      setZoom(next);
    } catch { /* ignore */ }
  }, [zoom, zoomRange, zoomSupported]);

  // Capture current frame, then analyze
  const captureAndAnalyze = useCallback(async () => {
    const video = videoRef.current; if (!video || !video.videoWidth) return;
    setAnalyzing(true);
    const t0 = performance.now();
    try {
      // Downscale to max 1280px on the longest side for better model precision and faster upload
      const srcW = video.videoWidth, srcH = video.videoHeight;
      const MAX = 1280;
      const scale = Math.min(1, MAX / Math.max(srcW, srcH));
      const dstW = Math.round(srcW * scale);
      const dstH = Math.round(srcH * scale);
      const canvas = document.createElement("canvas");
      canvas.width = dstW;
      canvas.height = dstH;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(video, 0, 0, dstW, dstH);
      const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.92)!);
      const base64 = await blobToBase64(blob);
      const result = await detect({ data: { imageBase64: base64, mimeType: "image/jpeg", classeHint: produto || undefined } });
      const url = URL.createObjectURL(blob);
      setSnapshot({ blob, url, w: dstW, h: dstH });
      setDetections(result.detections);
      setClasse(result.classeDominante);
      setConfianca(result.confianca_media);
      setDetalhes(result.detalhes);
      setFps(Math.round(1000 / Math.max(1, performance.now() - t0) * 10) / 10);
      setPhase("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na detecção");
    } finally {
      setAnalyzing(false);
    }
  }, [detect, produto]);

  const reset = useCallback(() => {
    if (snapshot) URL.revokeObjectURL(snapshot.url);
    setSnapshot(null); setDetections([]); setClasse(""); setConfianca(0); setDetalhes(null);
    setPhase("camera");
    if (videoRef.current && streamRef.current) videoRef.current.play().catch(() => {});
  }, [snapshot]);

  const save = useCallback(async () => {
    if (!snapshot) return;
    setPhase("saving");
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const path = `${uid}/ia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const up = await supabase.storage.from("contagens-camera").upload(path, snapshot.blob, {
        contentType: "image/jpeg", upsert: false,
      });
      if (up.error) throw new Error(`Upload: ${up.error.message}`);
      const { data: signed, error: signErr } = await supabase.storage.from("contagens-camera").createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw new Error(`URL: ${signErr.message}`);
      const imagem_url = signed?.signedUrl ?? path;

      const total = detections.length;
      const { error } = await supabase.from("contagens_camera").insert({
        user_id: uid,
        inventario_id: inventario ?? null,
        produto: produto || null,
        part_number: partNumber || null,
        observacao: observacao || null,
        imagem_url,
        quantidade_parafusos: 0,
        quantidade_porcas: 0,
        quantidade_arruelas: 0,
        total_itens: total,
        resultado_json: JSON.parse(JSON.stringify({
          modo: "ia_detection",
          classe_dominante: classe,
          confianca_media: confianca,
          quantidade_esperada: qtdEsperada,
          detalhes,
          detections,
        })),
        status_confirmacao: true,
        origem: inventario ? "ia_inventario" : "ia_home",
      });
      if (error) throw error;
      toast.success("Contagem salva com sucesso.");
      navigate({
        to: inventario ? "/inventario/$id" : "/historico-camera",
        params: inventario ? { id: inventario } : undefined,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
      setPhase("review");
    }
  }, [snapshot, detections, classe, confianca, qtdEsperada, detalhes, inventario, produto, partNumber, observacao, navigate]);

  // Overlay click handler for manual edit
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const addMarker = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = overlayRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setDetections((arr) => [...arr, { x, y, w: 0.06, h: 0.06, classe: classe || "item", confianca: 1 }]);
  };
  const removeMarker = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDetections((arr) => arr.filter((_, i) => i !== idx));
  };

  // === REVIEW PHASE ===
  if (phase === "review" || phase === "saving") {
    const diff = qtdEsperada !== null ? detections.length - qtdEsperada : null;
    return (
      <div className="fixed inset-0 bg-black text-white flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 bg-black/80 backdrop-blur z-10">
          <button onClick={reset} className="p-2 -ml-2"><ArrowLeft className="size-6" /></button>
          <div className="text-center">
            <div className="text-xs uppercase tracking-wider opacity-60">Revisão</div>
            <div className="text-sm font-semibold">{classe || "Item"}</div>
          </div>
          <div className="w-10" />
        </div>

        <div className="relative flex-1 overflow-hidden bg-black">
          {snapshot && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                ref={overlayRef}
                onClick={addMarker}
                className="relative cursor-crosshair"
                style={{
                  aspectRatio: `${snapshot.w} / ${snapshot.h}`,
                  maxWidth: "100%", maxHeight: "100%",
                  width: snapshot.w > snapshot.h ? "100%" : "auto",
                  height: snapshot.w > snapshot.h ? "auto" : "100%",
                }}
              >
                <img src={snapshot.url} alt="" className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                {detections.map((d, i) => (
                  <Marker key={i} index={i + 1} d={d} onRemove={(e) => removeMarker(i, e)} />
                ))}
              </div>
            </div>
          )}

          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-foreground rounded-2xl px-5 py-2 shadow-xl">
            <div className="text-[10px] uppercase tracking-widest text-center opacity-80">Total</div>
            <div className="text-4xl font-black text-center leading-none">{detections.length}</div>
          </div>

          <div className="absolute top-3 right-3 bg-black/70 rounded-lg px-2 py-1 text-[11px] space-y-0.5">
            <div>Conf: {Math.round(confianca * 100)}%</div>
            {fps !== null && <div className="opacity-60">{fps.toFixed(1)} FPS</div>}
          </div>
        </div>

        <div className="bg-card text-card-foreground px-4 pt-3 pb-5 space-y-3 max-h-[55vh] overflow-y-auto">
          {qtdEsperada !== null && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Detectado" value={String(detections.length)} tone="primary" />
              <Stat label="Esperado" value={String(qtdEsperada)} />
              <Stat
                label="Diferença"
                value={(diff! > 0 ? "+" : "") + String(diff)}
                tone={diff === 0 ? "success" : diff! > 0 ? "warning" : "danger"}
              />
            </div>
          )}

          <div className="grid gap-2">
            <Field label="Produto" v={produto} onChange={setProduto} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="Part Number" v={partNumber} onChange={setPartNumber} />
              <Field label="Classe IA" v={classe} onChange={setClasse} />
            </div>
            <Field label="Observação" v={observacao} onChange={setObservacao} textarea />
          </div>

          {detalhes && <p className="text-xs italic text-muted-foreground">{detalhes}</p>}

          <p className="text-[11px] text-muted-foreground">Toque na imagem para adicionar marcador · toque no marcador para remover.</p>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={reset} className="bg-card border border-border rounded-xl py-3 font-semibold flex items-center justify-center gap-2">
              <RotateCcw className="size-5" /> Nova Contagem
            </button>
            <button onClick={save} disabled={phase === "saving"}
              className="bg-primary text-primary-foreground rounded-xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {phase === "saving" ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />} Salvar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // === CAMERA PHASE ===
  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col">
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/70 to-transparent">
        <Link to="/home" className="p-2 -ml-2 bg-black/40 rounded-full"><X className="size-5" /></Link>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-widest opacity-70">Contagem por IA</div>
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
        <div className="border-2 border-accent/70 rounded-3xl" style={{ width: "85%", height: "55%" }}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-px bg-accent/70" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-6 w-px bg-accent/70" />
        </div>
      </div>

      {/* Counter widget at top */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 bg-black/70 backdrop-blur rounded-2xl px-6 py-2 border border-white/10">
        <div className="text-[10px] uppercase tracking-widest text-center opacity-70">Pronto p/ contar</div>
        <div className="text-3xl font-black text-center text-accent leading-none">—</div>
      </div>

      {/* Right side: zoom controls */}
      {zoomSupported && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
          <button onClick={() => changeZoom(zoomRange.step * 2)} className="bg-black/60 rounded-full p-3"><ZoomIn className="size-5" /></button>
          <div className="text-center text-xs bg-black/60 rounded-full py-1">{zoom.toFixed(1)}x</div>
          <button onClick={() => changeZoom(-zoomRange.step * 2)} className="bg-black/60 rounded-full p-3"><ZoomOut className="size-5" /></button>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 to-transparent pt-8 pb-6 px-6">
        <div className="mb-3">
          <input
            value={produto}
            onChange={(e) => setProduto(e.target.value)}
            placeholder="Código do produto (opcional, para comparar com estoque)"
            className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-sm outline-none focus:border-accent placeholder:text-white/50"
          />
          {qtdEsperada !== null && (
            <div className="text-xs mt-1 opacity-80 flex items-center gap-1">
              <CheckCircle2 className="size-3 text-accent" /> Estoque atual: <span className="font-semibold">{qtdEsperada}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-around">
          <button onClick={() => setPaused((p) => !p)} className="flex flex-col items-center gap-1">
            <div className="bg-white/15 rounded-full p-3">{paused ? <Play className="size-5" /> : <Pause className="size-5" />}</div>
            <span className="text-[10px] opacity-80">{paused ? "Retomar" : "Pausar"}</span>
          </button>

          <button onClick={captureAndAnalyze} disabled={analyzing}
            className="bg-accent text-accent-foreground rounded-full size-20 flex flex-col items-center justify-center shadow-2xl ring-4 ring-white/20 active:scale-95 transition-transform disabled:opacity-60">
            {analyzing ? <Loader2 className="size-7 animate-spin" /> : <Scan className="size-8" />}
            <span className="text-[9px] font-bold uppercase">{analyzing ? "IA…" : "Contar"}</span>
          </button>

          <Link to="/historico-camera" className="flex flex-col items-center gap-1">
            <div className="bg-white/15 rounded-full p-3"><Camera className="size-5" /></div>
            <span className="text-[10px] opacity-80">Histórico</span>
          </Link>
        </div>
      </div>

      {analyzing && (
        <div className="absolute inset-0 bg-black/40 z-30 flex items-center justify-center pointer-events-none">
          <div className="bg-card text-card-foreground rounded-2xl px-6 py-4 flex items-center gap-3 shadow-2xl">
            <Loader2 className="size-6 animate-spin text-accent" />
            <div>
              <div className="font-semibold">Analisando imagem…</div>
              <div className="text-xs text-muted-foreground">Detectando objetos com IA</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Marker({ index, d, onRemove }: { index: number; d: Detection; onRemove: (e: React.MouseEvent) => void }) {
  const size = Math.max(24, Math.min(56, Math.max(d.w, d.h) * 380));
  return (
    <button
      onClick={onRemove}
      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/90 text-accent-foreground font-bold border-2 border-white shadow-lg flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
      style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%`, width: size, height: size, fontSize: Math.max(10, size * 0.4) }}
      title={`${d.classe} · ${Math.round(d.confianca * 100)}%`}
    >
      {index}
    </button>
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf("base64,");
      resolve(i >= 0 ? s.slice(i + 7) : s);
    };
    r.readAsDataURL(blob);
  });
}

// Silence unused import warnings in dev (lucide tree-shake)
void Plus; void Trash2;

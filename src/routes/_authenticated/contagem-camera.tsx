import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analisarImagemContagem } from "@/lib/contagem-camera.functions";
import { Camera, Image as ImageIcon, Loader2, RotateCcw, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LiveCount } from "@/components/LiveCount";

type Search = { inventario?: string };

export const Route = createFileRoute("/_authenticated/contagem-camera")({
  component: ContagemCamera,
  validateSearch: (s: Record<string, unknown>): Search => ({
    inventario: typeof s.inventario === "string" ? s.inventario : undefined,
  }),
});

type Result = {
  quantidade_parafusos: number;
  quantidade_porcas: number;
  quantidade_arruelas: number;
  total_itens: number;
  confianca: number | null;
  detalhes: string | null;
};

function ContagemCamera() {
  const { inventario } = Route.useSearch();
  const navigate = useNavigate();
  const camRef = useRef<HTMLInputElement | null>(null);
  const galRef = useRef<HTMLInputElement | null>(null);
  const analisar = useServerFn(analisarImagemContagem);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [produto, setProduto] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [observacao, setObservacao] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [invNome, setInvNome] = useState<string | null>(null);

  useEffect(() => {
    if (!inventario) return;
    supabase.from("inventarios").select("nome_inventario").eq("id", inventario).single()
      .then(({ data }) => setInvNome(data?.nome_inventario ?? null));
  }, [inventario]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onPick = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Selecione uma imagem."); return; }
    setFile(f);
    setResult(null);
  };

  const clearImage = () => { setFile(null); setResult(null); };

  const onAnalisar = async () => {
    if (!file) return;
    setAnalyzing(true);
    try {
      const base64 = await fileToBase64(file);
      const r = await analisar({ data: { imageBase64: base64, mimeType: file.type } });
      setResult(r);
      toast.success("Análise concluída. Revise as quantidades.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao analisar imagem");
    } finally {
      setAnalyzing(false);
    }
  };

  const onSave = async () => {
    if (!file || !result) return;
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error("Sessão expirada");

      const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const up = await supabase.storage.from("contagens-camera").upload(path, file, {
        contentType: file.type, upsert: false,
      });
      if (up.error) throw up.error;
      const { data: signed } = await supabase.storage.from("contagens-camera").createSignedUrl(path, 60 * 60 * 24 * 365);
      const imagem_url = signed?.signedUrl ?? path;

      const total = result.quantidade_parafusos + result.quantidade_porcas + result.quantidade_arruelas;
      const { error } = await supabase.from("contagens_camera").insert({
        user_id: uid,
        inventario_id: inventario ?? null,
        produto: produto || null,
        part_number: partNumber || null,
        observacao: observacao || null,
        imagem_url,
        quantidade_parafusos: result.quantidade_parafusos,
        quantidade_porcas: result.quantidade_porcas,
        quantidade_arruelas: result.quantidade_arruelas,
        total_itens: total,
        resultado_json: JSON.parse(JSON.stringify(result)),
        status_confirmacao: true,
        origem: inventario ? "camera_inventario" : "camera_home",
      });
      if (error) throw error;
      toast.success("Contagem salva.");
      navigate({ to: inventario ? "/inventario/$id" : "/historico-camera", params: inventario ? { id: inventario } : undefined });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppShell title="Contagem por Câmera">
      <div className="space-y-4">
        {invNome && (
          <div className="bg-accent/15 border border-accent/30 rounded-lg px-3 py-2 text-sm">
            Vinculado ao inventário: <span className="font-semibold">{invNome}</span>
          </div>
        )}

        <div className="grid gap-2">
          <Field label="Produto (opcional)" v={produto} onChange={setProduto} />
          <Field label="Part Number (opcional)" v={partNumber} onChange={setPartNumber} />
          <Field label="Observação (opcional)" v={observacao} onChange={setObservacao} textarea />
        </div>

        {!preview ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => camRef.current?.click()}
                className="bg-primary text-primary-foreground rounded-xl py-4 font-semibold flex flex-col items-center justify-center gap-1 min-h-[100px]"
              >
                <Camera className="size-7" /> Tirar Foto
              </button>
              <button
                onClick={() => galRef.current?.click()}
                className="bg-card border border-border rounded-xl py-4 font-semibold flex flex-col items-center justify-center gap-1 min-h-[100px]"
              >
                <ImageIcon className="size-7" /> Galeria
              </button>
            </div>
            <LiveCount
              onFinish={(c) =>
                setResult({
                  quantidade_parafusos: c.parafuso,
                  quantidade_porcas: c.porca,
                  quantidade_arruelas: c.arruela,
                  total_itens: c.parafuso + c.porca + c.arruela,
                  confianca: null,
                  detalhes: "Contagem ao vivo (IA em tempo real)",
                })
              }
            />
          </>
        ) : (
          <div className="space-y-2">
            <div className="relative rounded-xl overflow-hidden border border-border bg-black/5">
              <img src={preview} alt="Pré-visualização" className="w-full max-h-[420px] object-contain" />
              <button onClick={clearImage} className="absolute top-2 right-2 bg-destructive text-destructive-foreground rounded-full p-2 shadow">
                <Trash2 className="size-4" />
              </button>
            </div>
            {!result && (
              <button
                onClick={onAnalisar}
                disabled={analyzing}
                className="w-full bg-accent text-accent-foreground rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {analyzing ? <><Loader2 className="size-5 animate-spin" /> Analisando…</> : <><Sparkles className="size-5" /> Analisar imagem</>}
              </button>
            )}
          </div>
        )}

        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
        <input ref={galRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)} />

        {result && (
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Resultado da contagem</h3>
              {result.confianca !== null && (
                <span className="text-xs text-muted-foreground">Confiança: {Math.round(result.confianca * 100)}%</span>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Counter label="Parafusos" value={result.quantidade_parafusos}
                onChange={(v) => setResult({ ...result, quantidade_parafusos: v })} />
              <Counter label="Porcas" value={result.quantidade_porcas}
                onChange={(v) => setResult({ ...result, quantidade_porcas: v })} />
              <Counter label="Arruelas" value={result.quantidade_arruelas}
                onChange={(v) => setResult({ ...result, quantidade_arruelas: v })} />
            </div>
            <div className="text-center bg-muted rounded-lg py-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Total</span>
              <div className="text-2xl font-bold">
                {result.quantidade_parafusos + result.quantidade_porcas + result.quantidade_arruelas}
              </div>
            </div>
            {result.detalhes && <p className="text-xs text-muted-foreground italic">{result.detalhes}</p>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button onClick={clearImage} className="bg-card border border-border rounded-xl py-3 font-semibold flex items-center justify-center gap-2">
                <RotateCcw className="size-5" /> Refazer foto
              </button>
              <button onClick={onSave} disabled={saving}
                className="bg-primary text-primary-foreground rounded-xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                {saving ? <Loader2 className="size-5 animate-spin" /> : <Save className="size-5" />} Confirmar e salvar
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Field({ label, v, onChange, textarea }: { label: string; v: string; onChange: (s: string) => void; textarea?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {textarea ? (
        <textarea value={v} onChange={(e) => onChange(e.target.value)} rows={2}
          className="mt-1 w-full px-3 py-2.5 rounded-lg bg-card border border-border outline-none focus:border-ring" />
      ) : (
        <input value={v} onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full px-3 py-2.5 rounded-lg bg-card border border-border outline-none focus:border-ring" />
      )}
    </label>
  );
}

function Counter({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="bg-muted rounded-lg p-2 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="flex items-center justify-center gap-1 mt-1">
        <button onClick={() => onChange(Math.max(0, value - 1))} className="size-8 rounded-md bg-card border border-border font-bold">−</button>
        <input
          type="number" inputMode="numeric" min={0} value={value}
          onChange={(e) => onChange(Math.max(0, parseInt(e.target.value || "0", 10)))}
          className="w-14 text-center text-lg font-bold bg-transparent outline-none"
        />
        <button onClick={() => onChange(value + 1)} className="size-8 rounded-md bg-card border border-border font-bold">+</button>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf("base64,");
      resolve(i >= 0 ? s.slice(i + 7) : s);
    };
    r.readAsDataURL(file);
  });
}

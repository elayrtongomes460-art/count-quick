import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Play } from "lucide-react";

export const Route = createFileRoute("/_authenticated/novo-inventario")({
  component: Novo,
});

function Novo() {
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [resp, setResp] = useState("");
  const [obs, setObs] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: p } = await supabase.from("profiles").select("nome").eq("id", u.user.id).maybeSingle();
        if (p?.nome) setResp(p.nome);
      }
    })();
  }, []);

  const iniciar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !resp.trim()) return toast.error("Nome e responsável são obrigatórios.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setSaving(false); return toast.error("Sessão expirada."); }
    const { data: inv, error } = await supabase.from("inventarios").insert({
      nome_inventario: nome.trim(),
      data,
      responsavel: resp.trim(),
      observacao: obs || null,
      status: "Em andamento",
      user_id: u.user.id,
    }).select("id").single();
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Inventário iniciado.");
    navigate({ to: "/contagem/$id", params: { id: inv.id } });
  };

  return (
    <AppShell title="Novo Inventário">
      <form onSubmit={iniciar} className="space-y-3">
        <F label="Nome do inventário" required><input className="ipt" value={nome} onChange={e => setNome(e.target.value)} autoFocus /></F>
        <F label="Data" required><input type="date" className="ipt" value={data} onChange={e => setData(e.target.value)} /></F>
        <F label="Responsável" required><input className="ipt" value={resp} onChange={e => setResp(e.target.value)} /></F>
        <F label="Observação"><textarea className="ipt" rows={3} value={obs} onChange={e => setObs(e.target.value)} /></F>

        <button disabled={saving} className="w-full bg-accent text-accent-foreground rounded-xl py-4 font-semibold flex items-center justify-center gap-2 mt-3 disabled:opacity-60">
          <Play className="size-5" /> {saving ? "Iniciando…" : "Iniciar Inventário"}
        </button>
      </form>
      <style>{`.ipt{width:100%;background:var(--color-card);border:1px solid var(--color-border);border-radius:.5rem;padding:.875rem 1rem;font-size:16px;outline:none}.ipt:focus{border-color:var(--color-ring)}`}</style>
    </AppShell>
  );
}

function F({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  );
}

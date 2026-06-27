import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";
import { Pencil, Plus, Search, Trash2, X, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { parseItensFile } from "@/lib/import-itens";

export const Route = createFileRoute("/_authenticated/itens")({
  component: ItensPage,
});

type Item = {
  id: string;
  produto: string;
  part_number: string | null;
  designacao: string;
  quantidade_un: number;
  unidade_un: string;
  localizacao: string;
  preco_medio_pond: number;
};

const empty: Omit<Item, "id"> = {
  produto: "", part_number: "", designacao: "",
  quantidade_un: 0, unidade_un: "UN", localizacao: "", preco_medio_pond: 0,
};

function ItensPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("itens").select("*").order("produto");
    if (error) toast.error(error.message);
    setItens((data ?? []) as Item[]);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return itens;
    return itens.filter(i =>
      i.produto.toLowerCase().includes(s) ||
      (i.part_number ?? "").toLowerCase().includes(s) ||
      i.designacao.toLowerCase().includes(s)
    );
  }, [q, itens]);

  const remover = async (i: Item) => {
    if (!confirm(`Excluir item "${i.produto}"?`)) return;
    const { error } = await supabase.from("itens").delete().eq("id", i.id);
    if (error) return toast.error(error.message);
    toast.success("Item excluído.");
    load();
  };

  const exportCsv = () => {
    const header = ["Produto","Part_Number","Designacao","Quantidade_UN","Unidade_UN","Localizacao","Preco_medio_pond"];
    const rows = itens.map(i => [i.produto, i.part_number ?? "", i.designacao, i.quantidade_un, i.unidade_un, i.localizacao, i.preco_medio_pond]);
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(";")).join("\n");
    const blob = new Blob(["\ufeff"+csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `itens_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/\r/g,"").split("\n").filter(Boolean);
    if (lines.length < 2) return toast.error("Arquivo vazio.");
    const sep = lines[0].includes(";") ? ";" : ",";
    const parse = (l: string) => l.split(sep).map(c => c.replace(/^"|"$/g,"").replace(/""/g,'"').trim());
    const head = parse(lines[0]).map(h => h.toLowerCase());
    const req = ["produto","part_number","designacao","quantidade_un","unidade_un","localizacao","preco_medio_pond"];
    if (!req.every(r => head.includes(r))) return toast.error("Cabeçalhos esperados: " + req.join(", "));
    const idx = Object.fromEntries(req.map(r => [r, head.indexOf(r)]));
    let ok = 0, upd = 0, err = 0;
    for (let i = 1; i < lines.length; i++) {
      const c = parse(lines[i]);
      const row = {
        produto: c[idx.produto],
        part_number: c[idx.part_number] || "",
        designacao: c[idx.designacao],
        quantidade_un: Number(c[idx.quantidade_un].replace(",",".")) || 0,
        unidade_un: c[idx.unidade_un] || "UN",
        localizacao: c[idx.localizacao] || "",
        preco_medio_pond: Number(c[idx.preco_medio_pond].replace(",",".")) || 0,
      };
      if (!row.produto || !row.designacao) { err++; continue; }
      const { error } = await supabase.from("itens").upsert(row, { onConflict: "produto" });
      if (error) err++; else { if (itens.find(x => x.produto === row.produto)) upd++; else ok++; }
    }
    toast.success(`Importado: ${ok} novo(s), ${upd} atualizado(s), ${err} erro(s).`);
    load();
  };

  return (
    <AppShell
      title="Cadastro de Itens"
      action={
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          aria-label="Novo item"
          className="p-2 rounded-md bg-accent text-accent-foreground"
        >
          <Plus className="size-5" />
        </button>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Pesquisar por produto, part number ou descrição"
            className="w-full pl-10 pr-3 py-3 rounded-lg bg-card border border-border outline-none focus:border-ring"
          />
        </div>

        <div className="flex gap-2">
          <button onClick={exportCsv} className="flex-1 py-2.5 rounded-lg border border-border bg-card font-medium text-sm flex items-center justify-center gap-2">
            <Download className="size-4" /> Exportar CSV
          </button>
          <button onClick={() => fileRef.current?.click()} className="flex-1 py-2.5 rounded-lg border border-border bg-card font-medium text-sm flex items-center justify-center gap-2">
            <Upload className="size-4" /> Importar CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} />
        </div>

        <div className="text-xs text-muted-foreground px-1">
          {loading ? "Carregando…" : `${filtered.length} item(ns)`}
        </div>

        <ul className="space-y-2">
          {filtered.map(i => (
            <li key={i.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm font-semibold text-primary">{i.produto}</div>
                  <div className="text-sm font-medium truncate">{i.designacao}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                    {i.part_number && <span>PN: {i.part_number}</span>}
                    <span>Qtd: {num(i.quantidade_un, 0)} {i.unidade_un}</span>
                    <span>{i.localizacao}</span>
                    <span>{brl(i.preco_medio_pond)}</span>
                  </div>
                </div>
                <button onClick={() => { setEditing(i); setShowForm(true); }} className="p-2 rounded-md bg-secondary"><Pencil className="size-4" /></button>
                <button onClick={() => remover(i)} className="p-2 rounded-md bg-destructive/10 text-destructive"><Trash2 className="size-4" /></button>
              </div>
            </li>
          ))}
          {!loading && filtered.length === 0 && (
            <li className="text-center text-muted-foreground py-10">Nenhum item encontrado.</li>
          )}
        </ul>
      </div>

      {showForm && (
        <ItemForm
          initial={editing ?? { id: "", ...empty }}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </AppShell>
  );
}

function ItemForm({ initial, onClose, onSaved }: { initial: Item; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!initial.id;
  const [f, setF] = useState<Item>(initial);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof Item>(k: K, v: Item[K]) => setF(p => ({ ...p, [k]: v }));

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.produto.trim()) return toast.error("Produto é obrigatório.");
    if (!f.designacao.trim()) return toast.error("Designação é obrigatória.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      produto: f.produto.trim(),
      part_number: f.part_number ?? "",
      designacao: f.designacao.trim(),
      quantidade_un: Number(f.quantidade_un) || 0,
      unidade_un: f.unidade_un || "UN",
      localizacao: f.localizacao ?? "",
      preco_medio_pond: Number(f.preco_medio_pond) || 0,
      created_by: u.user?.id,
    };
    const { error } = isEdit
      ? await supabase.from("itens").update(payload).eq("id", initial.id)
      : await supabase.from("itens").insert(payload);
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("Já existe um item com este Produto.");
      return toast.error(error.message);
    }
    toast.success(isEdit ? "Item atualizado." : "Item cadastrado.");
    if (!isEdit) setF({ id: "", ...empty });
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-card text-card-foreground w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-lg">{isEdit ? "Editar item" : "Novo item"}</h2>
          <button onClick={onClose} className="p-2 -mr-2"><X className="size-5" /></button>
        </div>
        <form onSubmit={salvar} className="p-4 space-y-3">
          <FF label="Produto" required><input className="ipt" value={f.produto} onChange={e => set("produto", e.target.value)} autoFocus={!isEdit} /></FF>
          <FF label="Part Number"><input className="ipt" value={f.part_number ?? ""} onChange={e => set("part_number", e.target.value)} /></FF>
          <FF label="Designação" required><input className="ipt" value={f.designacao} onChange={e => set("designacao", e.target.value)} /></FF>
          <div className="grid grid-cols-2 gap-3">
            <FF label="Quantidade UN"><input type="number" step="any" inputMode="decimal" className="ipt" value={f.quantidade_un} onChange={e => set("quantidade_un", Number(e.target.value))} /></FF>
            <FF label="Unidade UN"><input className="ipt" value={f.unidade_un} onChange={e => set("unidade_un", e.target.value)} /></FF>
          </div>
          <FF label="Localização"><input className="ipt" value={f.localizacao} onChange={e => set("localizacao", e.target.value)} /></FF>
          <FF label="Preço médio pond."><input type="number" step="any" inputMode="decimal" className="ipt" value={f.preco_medio_pond} onChange={e => set("preco_medio_pond", Number(e.target.value))} /></FF>

          <button type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground py-3.5 rounded-lg font-semibold mt-2 disabled:opacity-60">
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </form>
        <style>{`.ipt{width:100%;background:var(--color-background);border:1px solid var(--color-border);border-radius:.5rem;padding:.75rem .875rem;font-size:16px;outline:none}.ipt:focus{border-color:var(--color-ring)}`}</style>
      </div>
    </div>
  );
}

function FF({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
    </label>
  );
}

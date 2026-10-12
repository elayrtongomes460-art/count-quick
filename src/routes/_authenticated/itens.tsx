import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";
import { Pencil, Plus, Search, Trash2, X, Download, Upload, Eraser } from "lucide-react";
import { toast } from "sonner";
import { parseItensFile } from "@/lib/import-itens";
import { serializeCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/itens")({
  head: () => ({ meta: [{"title": "Cadastro de Itens — Inventário"}, {"name": "description", "content": "Cadastro permanente de códigos, descrições e especificações de produtos."}, {"property": "og:title", "content": "Cadastro de Itens — Inventário"}, {"property": "og:description", "content": "Cadastro permanente de códigos, descrições e especificações de produtos."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: ItensPage,
});

type Item = {
  id: string;
  produto: string;
  part_number: string | null;
  designacao: string;
  especificacoes: string;
  quantidade_un: number;
  unidade_un: string;
  localizacao: string;
  preco_medio_pond: number;
};

const empty: Omit<Item, "id"> = {
  produto: "", part_number: "", designacao: "", especificacoes: "",
  quantidade_un: 0, unidade_un: "UN", localizacao: "", preco_medio_pond: 0,
};

const normalizeCodigo = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();

function ItensPage() {
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Item | null>(null);
  const [showForm, setShowForm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const all: Item[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from("itens").select("*").order("produto").order("id").range(offset, offset + pageSize - 1);
        if (error) throw error;
        all.push(...((data ?? []) as Item[]));
        if (!data || data.length < pageSize) break;
      }
      setItens(all);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível carregar todos os itens. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
    const s = normalizeSearch(q);
    if (!s) return itens;
    return itens.filter(i =>
      normalizeSearch(i.produto).includes(s) ||
      normalizeSearch(i.part_number ?? "").includes(s) ||
      normalizeSearch(i.designacao).includes(s)
    );
  }, [q, itens]);

  const remover = async (i: Item) => {
    if (!confirm(`Excluir item "${i.produto}"?`)) return;
    const { error } = await supabase.from("itens").delete().eq("id", i.id);
    if (error) {
      if (error.code === "23503") return toast.error("Este item está em inventários antigos. Atualize a página e tente novamente.");
      return toast.error(error.message);
    }
    toast.success("Item excluído.");
    load();
  };

  const exportCsv = () => {
    const header = ["Produto","Part_Number","Designacao","Especificacoes","Unidade_UN","Localizacao","Preco_Medio_Pond"];
    const rows = itens.map(i => [i.produto, i.part_number ?? "", i.designacao, i.especificacoes, i.unidade_un, i.localizacao, i.preco_medio_pond]);
    const csv = serializeCsv([header, ...rows]);
    const blob = new Blob(["\ufeff"+csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `itens_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  };

  const importFile = async (file: File) => {
    try {
      toast.loading("Lendo arquivo…", { id: "imp" });
      const rows = await parseItensFile(file);
      if (!rows.length) {
        toast.error("Nenhum item válido encontrado no arquivo.", { id: "imp" });
        return;
      }
      toast.loading(`Importando ${rows.length} item(ns)…`, { id: "imp" });
      const existentes = new Set(itens.map((x) => normalizeCodigo(x.produto)));
      let ok = 0, upd = 0, err = 0;
      for (const row of rows) {
        const payload = {

          produto: normalizeCodigo(row.produto),
          part_number: normalizeCodigo(row.part_number),
          designacao: String(row.designacao ?? "").trim(),
          unidade_un: normalizeCodigo(row.unidade_un) || "UN",
          localizacao: String(row.localizacao ?? "").trim(),
          preco_medio_pond: row.preco_medio_pond,

        };
        const { error } = await supabase.from("itens").upsert(payload, { onConflict: "produto" });
        if (error) err++;
        else if (existentes.has(payload.produto)) upd++;
        else ok++;
      }
      toast.success(`Importado: ${ok} novo(s), ${upd} atualizado(s), ${err} erro(s).`, { id: "imp" });
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao importar.", { id: "imp" });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const limparTudo = async () => {
    if (!itens.length) return toast.info("Nenhum item para limpar.");
    const c1 = confirm(`Isso vai EXCLUIR todos os ${itens.length} códigos cadastrados. As contagens antigas dos inventários serão preservadas. Deseja continuar?`);
    if (!c1) return;
    const c2 = prompt('Para confirmar, digite LIMPAR');
    if ((c2 ?? "").trim().toUpperCase() !== "LIMPAR") return toast.info("Ação cancelada.");
    toast.loading("Excluindo itens…", { id: "clr" });
    const { error } = await supabase.from("itens").delete().not("id", "is", null);
    if (error) {
      if (error.code === "23503") return toast.error("O vínculo do histórico ainda não atualizou. Recarregue a página e tente novamente.", { id: "clr" });
      return toast.error(error.message, { id: "clr" });
    }
    toast.success(`Todos os ${itens.length} códigos foram excluídos.`, { id: "clr" });
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
            <Upload className="size-4" /> Importar
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,.xlsx,.xls,.docx,.pdf" hidden onChange={e => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>
        <button onClick={limparTudo} className="w-full py-2.5 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive font-medium text-sm flex items-center justify-center gap-2">
          <Eraser className="size-4" /> Limpar tudo
        </button>

        <div className="text-[11px] text-muted-foreground px-1 -mt-1">
          Aceita CSV, TXT, XLSX, DOCX e PDF. Colunas: produto, part_number, designacao, unidade_un, localizacao, preco_medio_pond. Quantidade é importada ao iniciar um inventário.
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
                    <span>{i.unidade_un}</span>
                    {i.especificacoes && <span>{i.especificacoes}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    <span className="break-all">Localização: {i.localizacao || "—"}</span>
                    <span>Preço médio ponderado: {brl(i.preco_medio_pond)}</span>
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
    if (!Number.isFinite(f.preco_medio_pond) || f.preco_medio_pond < 0) return toast.error("Informe um preço médio ponderado válido, igual ou maior que zero.");
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const payload = {
      produto: normalizeCodigo(f.produto),
      part_number: normalizeCodigo(f.part_number),
      designacao: f.designacao.trim(),
      especificacoes: f.especificacoes?.trim() ?? "",
      unidade_un: normalizeCodigo(f.unidade_un) || "UN",
      localizacao: f.localizacao.trim(),
      preco_medio_pond: f.preco_medio_pond,
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
          <FF label="Especificações"><textarea className="ipt" value={f.especificacoes ?? ""} onChange={e => set("especificacoes", e.target.value)} /></FF>
          <FF label="Unidade UN"><input className="ipt" value={f.unidade_un} onChange={e => set("unidade_un", e.target.value)} /></FF>
          <FF label="Localização"><input className="ipt" value={f.localizacao} onChange={e => set("localizacao", e.target.value)} /></FF>
          <FF label="Preço médio ponderado (R$)"><input className="ipt" type="number" min="0" step="any" inputMode="decimal" value={f.preco_medio_pond} onChange={e => set("preco_medio_pond", Number(e.target.value))} /></FF>

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

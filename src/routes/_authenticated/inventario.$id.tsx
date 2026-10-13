import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateBR, dateOnly, num } from "@/lib/format";
import { Camera, Download, FileDown, Play, Scale, Pencil } from "lucide-react";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { correctInventoryQuantity } from '@/lib/inventory-correction.functions';
import { readAllPages } from '@/lib/paged-read';
import { gerarPdfInventario } from "@/lib/pdf-inventario";
import { serializeCsv } from "@/lib/csv";

export const Route = createFileRoute("/_authenticated/inventario/$id")({
  head: () => ({ meta: [{"title": "Detalhes do Inventário"}, {"name": "description", "content": "Itens contados, quantidades em estoque e divergências do inventário."}, {"property": "og:title", "content": "Detalhes do Inventário"}, {"property": "og:description", "content": "Itens contados, quantidades em estoque e divergências do inventário."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: Detalhes,
});

type Inv = {
  id: string; nome_inventario: string; data: string; responsavel: string;
  observacao: string | null; status: string; finalized_at: string | null;
};
type InvItem = {
  updated_at: string;
  contado: boolean; observacao: string;
  id: string; produto: string; part_number: string | null; designacao: string | null;
  quantidade_un_sistema: number; unidade_un: string | null; localizacao: string | null;
  preco_medio_pond: number; quantidade_contada: number; diferenca: number; valor_divergencia: number;
};

function Detalhes() {
  const { id } = Route.useParams();
  const [inv, setInv] = useState<Inv | null>(null);
  const [itens, setItens] = useState<InvItem[]>([]);
  const [editing, setEditing] = useState<InvItem | null>(null);
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const correct = useServerFn(correctInventoryQuantity);
  const queryClient = useQueryClient();
  const openEdit = (item: InvItem) => { setEditing(item); setQuantity(String(item.quantidade_contada)); setEditError(''); };
  const saveCorrection = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing || saving) return;
    const number = Number(quantity.trim().replace(',', '.'));
    if (!quantity.trim() || !Number.isFinite(number) || number < 0) { setEditError('Informe uma quantidade válida, igual ou maior que zero.'); return; }
    setSaving(true); setEditError('');
    try {
      const saved = await correct({ data: { inventoryId: id, rowId: editing.id, quantity: number, updatedAt: editing.updated_at } });
      setItens(current => current.map(item => item.id === saved.id ? saved : item));
      void queryClient.invalidateQueries({ queryKey: ['weight-inventory', id] });
      setEditing(null); toast.success('Quantidade atualizada.');
    } catch (error) { setEditError(error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setSaving(false); }
  };

  useEffect(() => {
    (async () => {
      const { data: i } = await supabase.from("inventarios").select("*").eq("id", id).single();
      setInv(i as Inv);
      try {
        const it = await readAllPages((from, to) => supabase.from("inventario_itens").select("*").eq("inventario_id", id).order("produto").order('id').range(from, to));
        setItens(it);
      } catch { toast.error('Não foi possível carregar os itens. Recarregue a página.'); }
    })();
  }, [id]);

  const resumo = useMemo(() => {
    const totalItens = itens.filter(i => i.contado).length;
    const comDif = itens.filter(i => Number(i.diferenca) !== 0).length;
    const sobra = itens.filter(i => Number(i.diferenca) > 0).reduce((s, i) => s + Number(i.diferenca), 0);
    const falta = itens.filter(i => Number(i.diferenca) < 0).reduce((s, i) => s + Number(i.diferenca), 0);
    const totalDiv = itens.reduce((s, i) => s + Number(i.valor_divergencia), 0);
    return { totalItens, comDif, sobra, falta, totalDiv };
  }, [itens]);

  const exportCsv = () => {
    if (!inv) return;
    const header = ["Produto","Part_Number","Designacao","Qtd_Sistema","Qtd_Contada","Diferenca","Unidade","Localizacao","Preco_medio","Valor_divergencia","Situacao","Observacao"];
    const rows = itens.map(i => [
      i.produto, i.part_number ?? "", i.designacao ?? "",
      i.quantidade_un_sistema, i.contado ? i.quantidade_contada : '', i.contado ? i.diferenca : '',
      i.unidade_un ?? "", i.localizacao ?? "", i.preco_medio_pond, i.contado ? i.valor_divergencia : '', i.contado ? 'Contado' : 'Pendente', i.observacao,
    ]);
    const meta = [
      ["Inventario", inv.nome_inventario],
      ["Data", dateOnly(inv.data)],
      ["Responsavel", inv.responsavel],
      ["Status", inv.status],
      ["Total itens", resumo.totalItens],
      ["Valor divergencia", resumo.totalDiv],
      [],
    ];
    const all = [...meta, header, ...rows];
    const csv = serializeCsv(all);
    const blob = new Blob(["\ufeff"+csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${inv.nome_inventario.replace(/\s+/g,"_")}.csv`;
    a.click();
  };

  if (!inv) return <AppShell title="Inventário"><p className="text-muted-foreground">Carregando…</p></AppShell>;

  return (
    <AppShell
      title={inv.nome_inventario}
      action={
        <div className="flex gap-1.5">
          <button onClick={() => { void gerarPdfInventario(inv, itens); }} className="p-2 rounded-md bg-primary text-primary-foreground" aria-label="Baixar PDF"><FileDown className="size-5" /></button>
          <button onClick={exportCsv} className="p-2 rounded-md bg-accent text-accent-foreground" aria-label="Exportar CSV"><Download className="size-5" /></button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="bg-card border border-border rounded-xl p-4 space-y-1.5">
          <Row k="Data" v={dateOnly(inv.data)} />
          <Row k="Responsável" v={inv.responsavel} />
          {inv.observacao && <Row k="Observação" v={inv.observacao} />}
          <Row k="Status" v={inv.status} />
          {inv.finalized_at && <Row k="Finalizado em" v={dateBR(inv.finalized_at)} />}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Itens contados" value={String(resumo.totalItens)} />
          <Stat label="Com divergência" value={String(resumo.comDif)} tone={resumo.comDif > 0 ? "danger" : "ok"} />
          <Stat label="Sobra (+)" value={num(resumo.sobra, 0)} />
          <Stat label="Falta (−)" value={num(resumo.falta, 0)} tone={resumo.falta < 0 ? "danger" : "ok"} />
          <div className="col-span-2">
            <Stat label="Valor total da divergência" value={brl(resumo.totalDiv)} tone={resumo.totalDiv !== 0 ? "danger" : "ok"} big />
          </div>
        </div>

        {inv.status === "Em andamento" && (
          <div className="grid gap-2">
            <Link to="/contagem/$id" params={{ id: inv.id }} className="w-full bg-accent text-accent-foreground rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2">
              <Play className="size-5" /> Continuar contagem
            </Link>
            <Button asChild className="w-full h-12"><Link to="/teste" search={{ inventario: inv.id }}><Scale />Continuar pela Balança</Link></Button>
            <Link to="/contagem-camera" search={{ inventario: inv.id }} className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 font-semibold flex items-center justify-center gap-2">
              <Camera className="size-5" /> Adicionar contagem por câmera
            </Link>
          </div>
        )}

        <h3 className="font-semibold mt-4">Itens ({itens.length})</h3>
        <ul className="space-y-2">
          {itens.map(i => {
            const dif = Number(i.diferenca);
            return (
              <li key={i.id} className={`rounded-xl border p-3 ${dif === 0 ? "bg-card border-border" : "bg-destructive/5 border-destructive/30"}`}>
                <div className="flex items-center justify-between gap-2"><div className="font-mono text-sm font-semibold text-primary">{i.produto}</div><Button variant="outline" size="icon" aria-label={`Editar quantidade de ${i.produto}`} title="Editar quantidade" onClick={() => openEdit(i)}><Pencil className="size-4" /></Button></div>
                <div className="text-sm">{i.designacao}</div>
                <div className="text-xs text-muted-foreground mt-1 flex gap-x-3 flex-wrap">
                  <span>Sist: {num(i.quantidade_un_sistema, 0)} {i.unidade_un}</span>
                  <span>{i.contado ? `Cont: ${num(i.quantidade_contada, 0)}` : 'Pendente'}</span>
                  <span className={dif === 0 ? "" : "font-semibold text-destructive"}>Dif: {dif > 0 ? "+" : ""}{num(dif, 0)}</span>
                  <span>{i.localizacao}</span>
                  <span>{brl(i.valor_divergencia)}</span>
                  {i.observacao && <span>{i.observacao}</span>}
                </div>
              </li>
            );
          })}
          {itens.length === 0 && <li className="text-center text-muted-foreground py-8">Nenhum item contado.</li>}
        </ul>
      </div>
      <Dialog open={Boolean(editing)} onOpenChange={open => { if (!open && !saving) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar quantidade contada</DialogTitle><DialogDescription>{editing?.produto} — {editing?.designacao}</DialogDescription></DialogHeader>
          <form onSubmit={saveCorrection} className="space-y-4">
            <p className="text-sm text-muted-foreground">Qtd sistema: {num(editing?.quantidade_un_sistema)} {editing?.unidade_un}</p>
            <label className="block space-y-2"><span className="text-sm font-medium">Quantidade contada</span><input autoFocus inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} disabled={saving} className="w-full rounded-md border border-input bg-background px-3 py-3 text-base" /></label>
            {editError && <p role="alert" className="text-sm text-destructive">{editError}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => setEditing(null)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar quantidade'}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right">{v}</span>
    </div>
  );
}
function Stat({ label, value, tone = "ok", big }: { label: string; value: string; tone?: "ok" | "danger"; big?: boolean }) {
  return (
    <div className={`rounded-xl p-3 border ${tone === "danger" ? "bg-destructive/10 border-destructive/30" : "bg-card border-border"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`font-bold ${big ? "text-xl" : "text-lg"}`}>{value}</div>
    </div>
  );
}

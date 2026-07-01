import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, dateOnly } from "@/lib/format";
import { ChevronRight, FileDown, Search } from "lucide-react";
import { gerarPdfInventario } from "@/lib/pdf-inventario";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/historico")({
  component: Historico,
});

type Inv = {
  id: string; nome_inventario: string; data: string; responsavel: string;
  observacao: string | null; status: string; finalized_at: string | null;
  inventario_itens: { quantidade_contada: number; valor_divergencia: number }[];
};

function Historico() {
  const [list, setList] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("inventarios")
        .select("id,nome_inventario,data,responsavel,observacao,status,finalized_at,inventario_itens(quantidade_contada,valor_divergencia)")
        .order("created_at", { ascending: false });
      if (!error) setList((data ?? []) as Inv[]);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return list.filter(i =>
      i.nome_inventario.toLowerCase().includes(s) ||
      i.responsavel.toLowerCase().includes(s)
    );
  }, [q, list]);

  const baixarPdf = async (inv: Inv, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDownloading(inv.id);
    try {
      const { data, error } = await supabase.from("inventario_itens").select("*").eq("inventario_id", inv.id).order("produto");
      if (error) throw error;
      await gerarPdfInventario(inv, (data ?? []) as never);
      toast.success("PDF gerado.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <AppShell title="Histórico">
      <div className="relative mb-3">
        <Search className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar inventário…" className="w-full pl-10 pr-3 py-3 rounded-lg bg-card border border-border outline-none focus:border-ring" />
      </div>
      {loading && <p className="text-muted-foreground text-sm">Carregando…</p>}
      <ul className="space-y-2">
        {filtered.map(inv => {
          const total = inv.inventario_itens.length;
          const totalDiv = inv.inventario_itens.reduce((s, x) => s + Number(x.valor_divergencia), 0);
          return (
            <li key={inv.id} className="bg-card border border-border rounded-xl active:scale-[0.99]">
              <Link to="/inventario/$id" params={{ id: inv.id }} className="block p-3.5">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{inv.nome_inventario}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex gap-x-3 flex-wrap">
                      <span>{dateOnly(inv.data)}</span>
                      <span>{inv.responsavel}</span>
                      <span>{total} item(ns)</span>
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${inv.status === "Finalizado" ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"}`}>
                        {inv.status}
                      </span>
                      <span className="text-xs font-medium">Divergência: {brl(totalDiv)}</span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 text-muted-foreground" />
                </div>
              </Link>
              <button
                onClick={(e) => baixarPdf(inv, e)}
                disabled={downloading === inv.id}
                className="w-full border-t border-border py-2.5 text-sm font-semibold flex items-center justify-center gap-2 text-primary disabled:opacity-60"
              >
                <FileDown className="size-4" />
                {downloading === inv.id ? "Gerando PDF…" : "Baixar relatório em PDF"}
              </button>
            </li>
          );
        })}
        {!loading && filtered.length === 0 && (
          <li className="text-center text-muted-foreground py-10">Nenhum inventário.</li>
        )}
      </ul>
    </AppShell>
  );
}


import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dateBR } from "@/lib/format";
import { Camera, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/historico-camera")({
  component: HistoricoCamera,
});

type Row = {
  id: string;
  produto: string | null;
  part_number: string | null;
  observacao: string | null;
  imagem_url: string;
  quantidade_parafusos: number;
  quantidade_porcas: number;
  quantidade_arruelas: number;
  total_itens: number;
  status_confirmacao: boolean;
  inventario_id: string | null;
  created_at: string;
  inventarios: { nome_inventario: string } | null;
};

function HistoricoCamera() {
  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("contagens_camera")
        .select("*, inventarios(nome_inventario)")
        .order("created_at", { ascending: false });
      setList((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell title="Histórico — Câmera">
      <div className="mb-3">
        <Link to="/contagem-camera" className="w-full bg-accent text-accent-foreground rounded-xl py-3 font-semibold flex items-center justify-center gap-2">
          <Camera className="size-5" /> Nova contagem por câmera
        </Link>
      </div>
      {loading && <p className="text-muted-foreground text-sm">Carregando…</p>}
      <ul className="space-y-2">
        {list.map((r) => (
          <li key={r.id}>
            <div className="bg-card border border-border rounded-xl p-3 flex gap-3">
              <img src={r.imagem_url} alt="" className="size-20 rounded-lg object-cover bg-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Total: {r.total_itens}</span>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${r.status_confirmacao ? "bg-success/15 text-success" : "bg-warning/20 text-warning-foreground"}`}>
                    {r.status_confirmacao ? "Confirmado" : "Pendente"}
                  </span>
                </div>
                <div className="text-xs mt-1 flex gap-x-3 flex-wrap">
                  <span>🔩 {r.quantidade_parafusos}</span>
                  <span>⬢ {r.quantidade_porcas}</span>
                  <span>◯ {r.quantidade_arruelas}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {dateBR(r.created_at)}
                  {r.inventarios?.nome_inventario && <> · <span className="font-medium">{r.inventarios.nome_inventario}</span></>}
                  {r.produto && <> · {r.produto}</>}
                </div>
              </div>
              {r.inventario_id && (
                <Link to="/inventario/$id" params={{ id: r.inventario_id }} className="self-center text-muted-foreground">
                  <ChevronRight className="size-5" />
                </Link>
              )}
            </div>
          </li>
        ))}
        {!loading && list.length === 0 && (
          <li className="text-center text-muted-foreground py-10">Nenhuma contagem por câmera ainda.</li>
        )}
      </ul>
    </AppShell>
  );
}

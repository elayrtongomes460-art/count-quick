import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { InventorySetup } from "@/components/InventorySetup";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { weightInventoriesOptions } from "@/lib/weight-inventory.queries";

export const Route = createFileRoute("/_authenticated/novo-inventario")({
  head: () => ({ meta: [{"title": "Novo Inventário"}, {"name": "description", "content": "Abertura de inventário com data, responsável e observações."}, {"property": "og:title", "content": "Novo Inventário"}, {"property": "og:description", "content": "Abertura de inventário com data, responsável e observações."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: Novo,
});

function Novo() {
  const navigate = useNavigate();
  const inventories = useQuery(weightInventoriesOptions);
  const [selectedId, setSelectedId] = useState("");
  const active = inventories.data?.inventories ?? [];
  const continueCount = () => {
    if (!active.some(inventory => inventory.id === selectedId)) return;
    void navigate({ to: "/contagem/$id", params: { id: selectedId } });
  };
  return <AppShell title="Novo Inventário">
    <section aria-label="Continuar uma contagem" className="mb-5 space-y-2 border-b border-border pb-5">
      <label htmlFor="resume-inventory" className="block text-sm font-medium">Continuar uma contagem</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select id="resume-inventory" value={selectedId} onChange={event => setSelectedId(event.target.value)} disabled={inventories.isPending || inventories.isError || !active.length} className="w-full min-w-0 flex-1 rounded-md border border-input bg-card px-3 py-2.5 text-base disabled:opacity-60">
          <option value="">{inventories.isPending ? "Carregando inventários…" : active.length ? "Selecionar inventário em andamento" : "Nenhum inventário em andamento"}</option>
          {active.map(inventory => <option key={inventory.id} value={inventory.id}>{inventory.nome_inventario} — {inventory.data.split('-').reverse().join('/')}</option>)}
        </select>
        <Button type="button" onClick={continueCount} disabled={!active.some(inventory => inventory.id === selectedId)} className="h-12 shrink-0"><Play />Continuar contagem</Button>
      </div>
      {inventories.isError && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">Não foi possível carregar os inventários.<Button type="button" variant="outline" onClick={() => void inventories.refetch()}>Tentar novamente</Button></div>}
    </section>
    <InventorySetup onCreated={id => { void navigate({ to: "/contagem/$id", params: { id } }); }} />
  </AppShell>;
}

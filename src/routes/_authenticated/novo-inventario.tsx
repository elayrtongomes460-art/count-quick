import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { InventorySetup } from "@/components/InventorySetup";

export const Route = createFileRoute("/_authenticated/novo-inventario")({
  head: () => ({ meta: [{"title": "Novo Inventário"}, {"name": "description", "content": "Abertura de inventário com data, responsável e observações."}, {"property": "og:title", "content": "Novo Inventário"}, {"property": "og:description", "content": "Abertura de inventário com data, responsável e observações."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: Novo,
});

function Novo() {
  const navigate = useNavigate();
  return <AppShell title="Novo Inventário"><InventorySetup onCreated={id => { void navigate({ to: "/contagem/$id", params: { id } }); }} /></AppShell>;
}

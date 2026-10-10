import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{"title": "Inventário Mobile"}, {"name": "description", "content": "Inventário operacional com cadastro de itens, scanner e conferência de estoque."}, {"property": "og:title", "content": "Inventário Mobile"}, {"property": "og:description", "content": "Inventário operacional com cadastro de itens, scanner e conferência de estoque."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  ssr: false,
  beforeLoad: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/home" });
    throw redirect({ to: "/auth" });
  },
  component: () => null,
});

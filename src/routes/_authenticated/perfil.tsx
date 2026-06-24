import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: Perfil,
});

function Perfil() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [profile, setProfile] = useState<{ nome: string; email: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("nome,email").eq("id", u.user.id).maybeSingle();
      setProfile(data ?? { nome: u.user.email ?? "", email: u.user.email ?? "" });
    })();
  }, []);

  const sair = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    toast.success("Sessão encerrada.");
    navigate({ to: "/auth", replace: true });
  };

  return (
    <AppShell title="Perfil">
      <div className="space-y-5">
        <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-4">
          <div className="bg-primary text-primary-foreground rounded-full p-3">
            <UserIcon className="size-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg truncate">{profile?.nome ?? "—"}</div>
            <div className="text-sm text-muted-foreground truncate">{profile?.email ?? "—"}</div>
          </div>
        </div>

        <button
          onClick={sair}
          className="w-full bg-destructive text-destructive-foreground rounded-xl py-4 font-semibold flex items-center justify-center gap-2 shadow active:scale-[0.99]"
        >
          <LogOut className="size-5" /> Sair
        </button>
      </div>
    </AppShell>
  );
}

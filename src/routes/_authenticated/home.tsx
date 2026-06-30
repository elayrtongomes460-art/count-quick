import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeCard } from "@/components/AppShell";
import { Boxes, Camera, ClipboardList, History, PackageSearch, Scan, User } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-3xl px-5 pt-10 pb-8 flex items-center gap-3">
          <div className="bg-accent text-accent-foreground rounded-xl p-2.5">
            <Boxes className="size-7" />
          </div>
          <div className="flex-1">
            <p className="text-xs opacity-75 uppercase tracking-wider">Sistema operacional</p>
            <h1 className="text-2xl font-bold leading-tight">Inventário</h1>
          </div>
          <Link to="/perfil" aria-label="Perfil" className="p-2 rounded-full bg-white/10 active:bg-white/20">
            <User className="size-6" />
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 -mt-4 pb-12">
        <div className="grid gap-3">
          <HomeCard
            to="/novo-inventario"
            icon={ClipboardList}
            label="Novo Inventário"
            desc="Iniciar contagem com scanner"
            tone="accent"
          />
          <HomeCard
            to="/contagem-ia"
            icon={Scan}
            label="Contagem por IA"
            desc="Detectar e contar objetos automaticamente pela câmera"
            tone="accent"
          />
          <HomeCard
            to="/contagem-camera"
            icon={Camera}
            label="Contagem por Foto"
            desc="Tirar foto e contar parafusos, porcas, arruelas"
            tone="muted"
          />
          <HomeCard
            to="/itens"
            icon={PackageSearch}
            label="Cadastro de Itens"
            desc="Cadastrar, editar e pesquisar"
            tone="primary"
          />
          <HomeCard
            to="/historico-camera"
            icon={Camera}
            label="Histórico — Câmera"
            desc="Contagens por câmera salvas"
            tone="muted"
          />
          <HomeCard
            to="/historico"
            icon={History}
            label="Histórico"
            desc="Inventários anteriores e relatórios"
            tone="muted"
          />
          <HomeCard
            to="/perfil"
            icon={User}
            label="Perfil / Sair"
            desc="Conta e encerrar sessão"
            tone="muted"
          />
        </div>
      </main>
    </div>
  );
}

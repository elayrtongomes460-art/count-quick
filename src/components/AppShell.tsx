import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, Boxes } from "lucide-react";
import type { ReactNode } from "react";

export function AppShell({
  title,
  children,
  back = true,
  action,
}: {
  title: string;
  children: ReactNode;
  back?: boolean;
  action?: ReactNode;
}) {
  const router = useRouter();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-md">
        <div className="mx-auto max-w-3xl flex items-center gap-3 px-4 h-14">
          {back ? (
            <button
              aria-label="Voltar"
              onClick={() => router.history.back()}
              className="p-2 -ml-2 rounded-md active:bg-white/10"
            >
              <ArrowLeft className="size-6" />
            </button>
          ) : (
            <Boxes className="size-6" />
          )}
          <h1 className="text-lg font-semibold tracking-tight flex-1 truncate">{title}</h1>
          {action}
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-3xl px-4 py-4 pb-24">{children}</main>
    </div>
  );
}

export function HomeCard({
  to,
  icon: Icon,
  label,
  desc,
  tone = "primary",
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  desc?: string;
  tone?: "primary" | "accent" | "muted" | "danger";
}) {
  const tones: Record<string, string> = {
    primary: "bg-primary text-primary-foreground",
    accent: "bg-accent text-accent-foreground",
    muted: "bg-card text-card-foreground border border-border",
    danger: "bg-destructive text-destructive-foreground",
  };
  return (
    <Link
      to={to}
      className={`${tones[tone]} rounded-xl p-5 flex items-center gap-4 shadow-sm active:scale-[0.98] transition-transform min-h-[88px]`}
    >
      <Icon className="size-9 shrink-0" />
      <div className="flex-1">
        <div className="text-lg font-semibold leading-tight">{label}</div>
        {desc && <div className="text-sm opacity-80 leading-tight mt-1">{desc}</div>}
      </div>
    </Link>
  );
}

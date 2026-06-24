import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home", replace: true });
    });
  }, [navigate]);

  const friendly = (msg: string) => {
    const m = msg.toLowerCase();
    if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
    if (m.includes("already registered") || m.includes("already exists")) return "Este e-mail já está cadastrado.";
    if (m.includes("password should be")) return "A senha deve ter no mínimo 6 caracteres.";
    if (m.includes("pwned")) return "Esta senha é muito comum. Escolha uma mais segura.";
    return msg;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (mode === "signup") {
      if (!nome.trim()) return toast.error("Informe seu nome.");
      if (senha !== senha2) return toast.error("As senhas não coincidem.");
      if (senha.length < 6) return toast.error("Senha mínima de 6 caracteres.");
    }
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        toast.success("Bem-vindo!");
        navigate({ to: "/home", replace: true });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: { nome },
            emailRedirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
          },
        });
        if (error) throw error;
        toast.success("Conta criada com sucesso!");
        navigate({ to: "/home", replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro inesperado.";
      toast.error(friendly(msg));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="bg-primary text-primary-foreground px-6 pt-12 pb-10">
        <div className="mx-auto max-w-md flex items-center gap-3">
          <div className="bg-accent text-accent-foreground rounded-xl p-2.5">
            <Boxes className="size-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Inventário</h1>
            <p className="text-sm opacity-80">Coletor de dados & scanner</p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-5 -mt-6">
        <div className="bg-card text-card-foreground rounded-2xl shadow-lg border border-border p-5">
          <div className="grid grid-cols-2 gap-2 mb-5 bg-muted rounded-lg p-1">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`py-2.5 rounded-md font-medium text-sm ${mode === "login" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`py-2.5 rounded-md font-medium text-sm ${mode === "signup" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`}
            >
              Criar conta
            </button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field label="Nome">
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="input"
                />
              </Field>
            )}
            <Field label="E-mail">
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Senha">
              <input
                type="password"
                required
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="input"
              />
            </Field>
            {mode === "signup" && (
              <Field label="Confirmar senha">
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={senha2}
                  onChange={(e) => setSenha2(e.target.value)}
                  className="input"
                />
              </Field>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-primary-foreground rounded-lg py-3.5 font-semibold text-base shadow active:scale-[0.99] disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-5 animate-spin" />}
              {mode === "login" ? "Entrar" : "Cadastrar"}
            </button>
          </form>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Otimizado para celular e coletor de dados.
        </p>
      </div>

      <style>{`
        .input {
          width: 100%;
          background: var(--color-background);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          padding: 0.875rem 1rem;
          font-size: 16px;
          outline: none;
        }
        .input:focus { border-color: var(--color-ring); box-shadow: 0 0 0 3px color-mix(in oklch, var(--color-ring) 25%, transparent); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

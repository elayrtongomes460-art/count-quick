import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { brl, num } from "@/lib/format";
import { toast } from "sonner";
import { Check, CheckCircle2, ClipboardList, Eraser, ListChecks, Plus, ScanLine } from "lucide-react";
import { SignaturePad } from "@/components/SignaturePad";
import { InventoryProgressList } from "@/components/InventoryProgressList";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/contagem/$id")({
  head: () => ({ meta: [{"title": "Contagem por Scanner — Inventário"}, {"name": "description", "content": "Conferência de produtos e quantidades por leitura de códigos."}, {"property": "og:title", "content": "Contagem por Scanner — Inventário"}, {"property": "og:description", "content": "Conferência de produtos e quantidades por leitura de códigos."}, {"property": "og:type", "content": "website"}, {"name": "twitter:card", "content": "summary"}] }),
  component: Contagem,
});

type Item = {
  id: string; produto: string; part_number: string | null; designacao: string;
  quantidade_un: number; unidade_un: string; localizacao: string; preco_medio_pond: number;
};
type InvItem = {
  contado: boolean;
  id: string; produto: string; quantidade_un_sistema: number; quantidade_contada: number;
  diferenca: number; unidade_un: string | null; localizacao: string | null;
  designacao: string | null; part_number: string | null; preco_medio_pond: number; valor_divergencia: number;
};

const normalizeCodigo = (value: string | null | undefined) =>
  String(value ?? "")
    .replace(/[\r\n\t]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();

function Contagem() {
  const { id: inventarioId } = Route.useParams();
  const navigate = useNavigate();
  const produtoRef = useRef<HTMLInputElement>(null);
  const qtdRef = useRef<HTMLInputElement>(null);

  const [inv, setInv] = useState<{ nome_inventario: string; status: string; origem_itens: string } | null>(null);
  const [produto, setProduto] = useState("");
  const [item, setItem] = useState<Item | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [qtdContada, setQtdContada] = useState("");
  const [contados, setContados] = useState<InvItem[]>([]);
  const [showList, setShowList] = useState(false);
  const [showInventoryList, setShowInventoryList] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [showSig, setShowSig] = useState(false);
  const scanBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCodigoRef = useRef<string>("");
  const processingRef = useRef<boolean>(false);

  const loadInv = useCallback(async () => {
    const { data } = await supabase.from("inventarios").select("nome_inventario,status,origem_itens").eq("id", inventarioId).single();
    setInv(data);
  }, [inventarioId]);

  const loadContados = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const rows: InvItem[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("inventario_itens").select("*").eq("inventario_id", inventarioId)
          .order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data ?? []) as InvItem[]);
        if ((data?.length ?? 0) < 1000) break;
      }
      setContados(rows);
    } catch {
      setListError("Não foi possível carregar os itens. Feche a lista e tente novamente.");
    } finally {
      setListLoading(false);
    }
  }, [inventarioId]);

  useEffect(() => { loadInv(); loadContados(); }, [loadInv, loadContados]);

  useEffect(() => { produtoRef.current?.focus(); }, []);

  const buscar = useCallback(async (cod: string) => {
    const codigo = normalizeCodigo(cod);
    if (!codigo) return;
    if (processingRef.current) {
      pendingCodigoRef.current = codigo;
      return;
    }
    processingRef.current = true;
    setNotFound(false);
    try {
      let { data, error } = await supabase.from("itens").select("*").eq("produto", codigo).maybeSingle();
      if (!data && !error) {
        const compactado = codigo.replace(/\s+/g, "");
        if (compactado !== codigo) {
          const res = await supabase.from("itens").select("*").eq("produto", compactado).maybeSingle();
          data = res.data;
          error = res.error;
        }
      }
      if (!data && !error) {
        const res = await supabase.from("itens").select("*").eq("part_number", codigo).maybeSingle();
        data = res.data;
        error = res.error;
      }
      if (error) { toast.error(error.message); return; }
      if (!data) { setNotFound(true); setItem(null); return; }
      const itemData = data as Item;
      // busca a quantidade atual DIRETO no banco para evitar estado defasado entre bipadas rápidas
      const { data: existing } = await supabase
        .from("inventario_itens")
        .select("*")
        .eq("inventario_id", inventarioId)
        .eq("produto", itemData.produto)
        .maybeSingle();
      if (!existing && !['legado', 'livre'].includes(inv?.origem_itens ?? '')) { toast.error('Produto não selecionado para este inventário.'); return; }
      if (!existing && inv?.origem_itens === 'livre') {
        itemData.quantidade_un = 0;
        itemData.preco_medio_pond = 0;
        itemData.localizacao = '';
      }
      if (existing) {
        itemData.quantidade_un = Number(existing.quantidade_un_sistema);
        itemData.preco_medio_pond = Number(existing.preco_medio_pond);
        itemData.localizacao = existing.localizacao ?? '';
        itemData.unidade_un = existing.unidade_un ?? 'UN';
        itemData.designacao = existing.designacao ?? itemData.designacao;
        itemData.part_number = existing.part_number;
      }
      const novaQtd = existing?.contado ? Number(existing.quantidade_contada) + 1 : 1;
      const diferenca = novaQtd - Number(itemData.quantidade_un);
      const valor_divergencia = diferenca * Number(itemData.preco_medio_pond);
      const payload = {
        inventario_id: inventarioId,
        item_id: itemData.id,
        produto: itemData.produto,
        part_number: itemData.part_number,
        designacao: itemData.designacao,
        quantidade_un_sistema: itemData.quantidade_un,
        unidade_un: itemData.unidade_un,
        localizacao: itemData.localizacao,
        preco_medio_pond: itemData.preco_medio_pond,
        quantidade_contada: novaQtd,
        contado: true,
        diferenca,
        valor_divergencia,
      };
      const { error: upErr } = await supabase.from("inventario_itens").upsert(payload, { onConflict: "inventario_id,produto" });
      if (upErr) { toast.error(upErr.message); return; }
      // feedback instantâneo (sem aguardar reload)
      setItem(itemData);
      setQtdContada(String(novaQtd));
      toast.success(`${itemData.produto}: ${novaQtd}`, { duration: 1200 });
      // recarrega lista em background (não bloqueia próxima bipada)
      void loadContados();
      // limpa imediatamente para próxima leitura (sem timeout)
      setProduto("");
      produtoRef.current?.focus();
      produtoRef.current?.select();
    } finally {
      processingRef.current = false;
      const pending = pendingCodigoRef.current;
      pendingCodigoRef.current = "";
      if (pending && pending !== codigo) void buscar(pending);
    }
  }, [inventarioId, loadContados, inv]);

  const onProdutoChange = (v: string) => {
    setProduto(v);
    if (!v.trim()) { setItem(null); setNotFound(false); return; }
    // Scanners de hardware (Zebra/Honeywell/Chainway) enviam caracteres muito rápido.
    // Se um bloco chegar em <30ms/char, disparamos leitura logo após o último char (sem esperar Enter).
    const now = performance.now();
    const dt = now - lastKeyTimeRef.current;
    lastKeyTimeRef.current = now;
    scanBufferRef.current = v;
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    if (dt < 50 && v.length >= 3) {
      // Aguarda o bloco completo do scanner; evita buscar código parcial e marcar item cadastrado como não encontrado.
      scanTimerRef.current = setTimeout(() => {
        if (scanBufferRef.current === v) void buscar(v);
      }, 120);
    }
  };

  const onProdutoKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      void buscar(produto);
    }
  };

  const limpar = () => {
    setProduto(""); setItem(null); setQtdContada(""); setNotFound(false);
    setTimeout(() => produtoRef.current?.focus(), 30);
  };

  const salvar = async () => {
    if (!item) return toast.error("Faça a leitura de um produto primeiro.");
    const selected = await supabase.from('inventario_itens').select('*').eq('inventario_id', inventarioId).eq('produto', item.produto).maybeSingle();
    if (selected.error) return toast.error(selected.error.message);
    if (!selected.data && !['legado', 'livre'].includes(inv?.origem_itens ?? '')) return toast.error('Produto não selecionado para este inventário.');
    if (!selected.data && inv?.origem_itens === 'livre') {
      item.quantidade_un = 0;
      item.preco_medio_pond = 0;
      item.localizacao = '';
    }
    if (selected.data) {
      item.quantidade_un = Number(selected.data.quantidade_un_sistema);
      item.preco_medio_pond = Number(selected.data.preco_medio_pond);
      item.localizacao = selected.data.localizacao ?? '';
    }
    const qc = Number(qtdContada.replace(",", "."));
    if (Number.isNaN(qc)) return toast.error("Informe a quantidade contada.");
    const diferenca = qc - Number(item.quantidade_un);
    const valor_divergencia = diferenca * Number(item.preco_medio_pond);
    const payload = {
      inventario_id: inventarioId,
      item_id: item.id,
      produto: item.produto,
      part_number: item.part_number,
      designacao: item.designacao,
      quantidade_un_sistema: item.quantidade_un,
      unidade_un: item.unidade_un,
      localizacao: item.localizacao,
      preco_medio_pond: item.preco_medio_pond,
      quantidade_contada: qc,
      contado: true,
      diferenca,
      valor_divergencia,
    };
    const { error } = await supabase.from("inventario_itens").upsert(payload, { onConflict: "inventario_id,produto" });
    if (error) return toast.error(error.message);
    toast.success(`${item.produto} salvo.`);
    limpar();
    loadContados();
  };

  const finalizar = () => {
    if (contados.length === 0) {
      if (!confirm("Nenhum item foi contado. Finalizar mesmo assim?")) return;
    }
    setShowSig(true);
  };

  const confirmarFinalizacao = async (sigs: string[]) => {
    const [assinatura, assinatura_supervisor] = sigs;
    const { error } = await supabase
      .from("inventarios")
      .update({
        status: "Finalizado",
        finalized_at: new Date().toISOString(),
        assinatura,
        assinatura_supervisor: assinatura_supervisor ?? null,
      })
      .eq("id", inventarioId);
    if (error) { toast.error(error.message); return; }
    setShowSig(false);
    toast.success("Inventário finalizado.");
    navigate({ to: "/inventario/$id", params: { id: inventarioId } });
  };


  const cadastrarNovo = async () => {
    const codigo = normalizeCodigo(produto);
    if (!codigo) return;
    const designacao = prompt("Designação do novo item:");
    if (!designacao) return;
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("itens").insert({
      produto: codigo,
      designacao: designacao.trim(),
      created_by: u.user?.id,
    }).select("*").single();
    if (error) return toast.error(error.message);
    setItem(data as Item);
    setNotFound(false);
    setTimeout(() => qtdRef.current?.focus(), 30);
    toast.success("Item cadastrado.");
  };

  const finalizado = inv?.status === "Finalizado";
  const showRef = inv ? ['excel', 'legado'].includes(inv.origem_itens) : false;
  const diferenca = item && qtdContada !== "" ? (Number(qtdContada.replace(",", ".")) - Number(item.quantidade_un)) : 0;

  return (
    <AppShell
      title={inv?.nome_inventario ?? "Contagem"}
      action={
        <div className="flex gap-2">
          <Button size="icon" onClick={() => setShowList(true)} className="bg-accent text-accent-foreground hover:bg-accent/90" aria-label="Itens contados" title="Itens contados">
            <ListChecks className="size-5" />
            <span className="sr-only">{contados.length}</span>
          </Button>
          <Button size="icon" variant="secondary" onClick={() => { setShowInventoryList(true); void loadContados(); }} aria-label="Itens do inventário" title="Itens do inventário">
            <ClipboardList className="size-5" />
          </Button>
        </div>
      }
    >
      {finalizado && (
        <div className="mb-3 bg-success/10 text-success border border-success/30 rounded-lg p-3 text-sm font-medium">
          Inventário finalizado. Modo somente leitura.
        </div>
      )}

      <div className="space-y-3">
        <div className="bg-card border-2 border-primary rounded-xl p-3 shadow-sm">
          <label className="text-xs font-semibold uppercase tracking-wide text-primary flex items-center gap-1.5">
            <ScanLine className="size-4" /> Produto (scanner)
          </label>
          <input
            ref={produtoRef}
            value={produto}
            onChange={e => onProdutoChange(e.target.value)}
            onKeyDown={onProdutoKey}
            disabled={finalizado}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="w-full mt-1 bg-transparent text-2xl font-mono font-bold py-2 outline-none"
            placeholder="Aguardando leitura…"
          />
        </div>

        {notFound && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
            <p className="font-medium text-destructive">Item não cadastrado.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={cadastrarNovo} className="flex-1 bg-primary text-primary-foreground py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2">
                <Plus className="size-4" /> Cadastrar item
              </button>
              <button onClick={limpar} className="flex-1 bg-secondary py-2.5 rounded-lg font-semibold">
                Voltar
              </button>
            </div>
          </div>
        )}

        {item && (
          <>
            <div className="bg-card border border-border rounded-xl p-3 space-y-2">
              <Row k="Part Number" v={item.part_number || "—"} />
              <Row k="Designação" v={item.designacao} />
              {showRef && (
                <div className="grid grid-cols-3 gap-2">
                  <Mini k="Qtd sistema" v={`${num(item.quantidade_un, 0)} ${item.unidade_un}`} />
                  <Mini k="Localização" v={item.localizacao || "—"} />
                  <Mini k="Preço médio ponderado" v={brl(item.preco_medio_pond)} />
                </div>
              )}
            </div>

            <div className="bg-card border-2 border-accent rounded-xl p-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-accent-foreground/80">Quantidade contada</label>
              <input
                ref={qtdRef}
                value={qtdContada}
                onChange={e => setQtdContada(e.target.value)}
                disabled={finalizado}
                type="number"
                step="any"
                inputMode="decimal"
                className="w-full mt-1 bg-transparent text-3xl font-bold py-2 outline-none"
                placeholder="0"
              />
              {showRef && qtdContada !== "" && (
                <div className={`mt-1 text-sm font-semibold ${diferenca === 0 ? "text-success" : diferenca > 0 ? "text-warning-foreground" : "text-destructive"}`}>
                  Diferença: {diferenca > 0 ? "+" : ""}{num(diferenca, 0)} · {brl(diferenca * Number(item.preco_medio_pond))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={limpar} className="py-3 rounded-lg bg-secondary font-semibold flex items-center justify-center gap-2">
                <Eraser className="size-4" /> Limpar
              </button>
              <button onClick={salvar} disabled={finalizado} className="py-3 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                <Check className="size-4" /> Salvar
              </button>
            </div>
          </>
        )}

        <button
          onClick={finalizar}
          disabled={finalizado}
          className="w-full bg-success text-success-foreground rounded-xl py-3.5 font-semibold mt-4 flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <CheckCircle2 className="size-5" /> Finalizar inventário
        </button>
      </div>

      {showList && (
        <ContadosList
          inventarioId={inventarioId}
          itens={contados}
          onClose={() => setShowList(false)}
          onChange={loadContados}
          finalizado={finalizado}
          showRef={showRef}
        />
      )}

      {showInventoryList && <InventoryProgressList items={contados} loading={listLoading} error={listError} name={inv?.nome_inventario ?? "Inventário"} showReferences={showRef} onClose={() => { setShowInventoryList(false); produtoRef.current?.focus(); }} />}

      <SignaturePad
        open={showSig}
        steps={["Assinatura do responsável pelo inventário", "Assinatura do supervisor / conferente"]}
        onCancel={() => setShowSig(false)}
        onConfirm={confirmarFinalizacao}
      />
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
function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-muted rounded-md p-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
      <div className="text-sm font-semibold break-words">{v}</div>
    </div>
  );
}

function ContadosList({
  inventarioId, itens, onClose, onChange, finalizado, showRef,
}: { inventarioId: string; itens: InvItem[]; onClose: () => void; onChange: () => void; finalizado: boolean; showRef: boolean }) {
  const [q, setQ] = useState("");
  const f = itens.filter(i =>
    i.produto.toLowerCase().includes(q.toLowerCase()) ||
    (i.designacao ?? "").toLowerCase().includes(q.toLowerCase())
  );
  const remover = async (id: string) => {
    if (!confirm("Remover item da contagem?")) return;
    const { error } = await supabase.from("inventario_itens").delete().eq("id", id);
    if (error) return toast.error(error.message);
    onChange();
  };
  const editar = async (it: InvItem) => {
    const v = prompt(`Nova quantidade contada para ${it.produto}:`, String(it.quantidade_contada));
    if (v === null) return;
    const qc = Number(v.replace(",", "."));
    if (Number.isNaN(qc)) return toast.error("Quantidade inválida.");
    const diferenca = qc - Number(it.quantidade_un_sistema);
    const valor_divergencia = diferenca * Number(it.preco_medio_pond);
    const { error } = await supabase.from("inventario_itens").update({
      quantidade_contada: qc, diferenca, valor_divergencia, contado: true,
    }).eq("id", it.id);
    if (error) return toast.error(error.message);
    onChange();
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/50 flex items-end" onClick={onClose}>
      <div className="bg-background w-full max-h-[90vh] rounded-t-2xl flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold">Itens contados ({itens.length})</h2>
          <button onClick={onClose} className="text-sm text-muted-foreground">Fechar</button>
        </div>
        <div className="p-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Pesquisar…" className="w-full px-3 py-2.5 rounded-lg border border-border bg-card outline-none focus:border-ring" />
        </div>
        <ul className="flex-1 overflow-y-auto px-3 pb-4 space-y-2">
          {f.length === 0 && <li className="text-center text-muted-foreground py-8">Nenhum item.</li>}
          {f.map(i => {
            const dif = Number(i.diferenca);
            return (
              <li key={i.id} className={`rounded-xl border p-3 ${dif === 0 || !showRef ? "bg-card border-border" : "bg-destructive/5 border-destructive/30"}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-sm font-semibold text-primary">{i.produto}</div>
                    <div className="text-sm truncate">{i.designacao}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-x-3 flex-wrap">
                      {showRef && <span>Sist: {num(i.quantidade_un_sistema, 0)}</span>}
                      <span>{i.contado ? `Cont: ${num(i.quantidade_contada, 0)}` : 'Pendente'}</span>
                      {showRef && <span className={dif === 0 ? "" : "font-semibold text-destructive"}>Dif: {dif > 0 ? "+" : ""}{num(dif, 0)}</span>}
                      {showRef && <span>{brl(i.valor_divergencia)}</span>}
                    </div>
                  </div>
                  {!finalizado && (
                    <div className="flex flex-col gap-1">
                      <button onClick={() => editar(i)} className="text-xs px-2 py-1 rounded bg-secondary">Editar</button>
                      <button onClick={() => remover(i.id)} className="text-xs px-2 py-1 rounded bg-destructive/10 text-destructive">Remover</button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

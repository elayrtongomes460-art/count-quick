import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useMemo, useState } from 'react';
import { Scale, Save, RotateCcw, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { weightCountingOptions } from '@/lib/weight-counting.queries';
import { countByWeight, parseWeight } from '@/lib/weight-counting';
import { brl } from '@/lib/format';
import { WeightInventoryPanel } from '@/components/WeightInventoryPanel';
import { weightInventoriesOptions, weightInventoryOptions } from '@/lib/weight-inventory.queries';
import { saveWeightInventoryItem } from '@/lib/weight-inventory.functions';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

export const Route = createFileRoute('/_authenticated/teste')({
  validateSearch: (search: Record<string, unknown>): { inventario?: string } => ({ inventario: typeof search.inventario === 'string' ? search.inventario : undefined }),
  head: () => ({ meta: [
    { title: 'Balança — Contagem por Peso | Inventário' },
    { name: 'description', content: 'Contagem de parafusos, porcas e arruelas pela balança, com referência de peso por produto.' },
    { property: 'og:title', content: 'Balança — Contagem por Peso | Inventário' },
    { property: 'og:description', content: 'Quantidade estimada de ferragens a partir do peso e da tara cadastrada.' },
    { property: 'og:type', content: 'website' },
    { name: 'twitter:card', content: 'summary' },
  ] }),
  loader: async ({ context }) => {
    const [data] = await Promise.all([context.queryClient.ensureQueryData(weightCountingOptions), context.queryClient.ensureQueryData(weightInventoriesOptions)]);
    return data;
  },
  component: Teste,
  errorComponent: ({ error, reset }) => <AppShell title="Balança"><p role="alert" className="text-destructive mb-4">{error instanceof Error ? error.message : 'Não foi possível carregar a contagem.'}</p><Button onClick={reset}>Tentar novamente</Button></AppShell>,
});

const inputClass = 'w-full h-11 min-w-0 rounded-md border border-input bg-card px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

function Teste() {
  const { data } = useSuspenseQuery(weightCountingOptions);
  const queryClient = useQueryClient();
  const { inventario: inventoryId = '' } = Route.useSearch();
  const navigate = useNavigate();
  const inventory = useQuery(weightInventoryOptions(inventoryId));
  const saveCount = useServerFn(saveWeightInventoryItem);
  const [savingCount, setSavingCount] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [tipo, setTipo] = useState('parafuso');
  const [unitWeight, setUnitWeight] = useState('');
  const [containerTare, setContainerTare] = useState('0');
  const [sampleWeight, setSampleWeight] = useState('');
  const [sampleCount, setSampleCount] = useState('');
  const [scaleWeight, setScaleWeight] = useState('');
  const [scaleUnit, setScaleUnit] = useState('g');
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('contagem');
  const item = data.items.find(i => i.id === itemId);
  const config = data.weights.find(w => w.item_id === itemId);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return data.items.filter(i => i.id === itemId || `${i.produto} ${i.part_number} ${i.designacao}`.toLocaleLowerCase().includes(term));
  }, [data.items, search, itemId]);

  useEffect(() => {
    setTipo(config?.tipo ?? 'parafuso');
    setUnitWeight(config ? String(config.peso_unitario_g) : '');
    setContainerTare(config ? String(config.tara_recipiente_g) : '0');
    setSampleWeight(''); setSampleCount(''); setScaleWeight('');
  }, [itemId, config]);

  const grossG = parseWeight(scaleWeight) * (scaleUnit === 'kg' ? 1000 : 1);
  const result = config ? countByWeight(grossG, Number(config.tara_recipiente_g), Number(config.peso_unitario_g)) : null;
  const dirty = config && (tipo !== config.tipo || parseWeight(unitWeight) !== Number(config.peso_unitario_g) || parseWeight(containerTare) !== Number(config.tara_recipiente_g));

  const calibrate = () => {
    const weight = parseWeight(sampleWeight), count = parseWeight(sampleCount);
    if (!(weight > 0) || !Number.isSafeInteger(count) || count <= 0) return toast.error('Informe o peso líquido e uma quantidade inteira maior que zero.');
    setUnitWeight(String(Number((weight / count).toPrecision(12))));
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const unitG = parseWeight(unitWeight), tareG = parseWeight(containerTare);
    if (!item || !(unitG > 0) || !Number.isFinite(tareG) || tareG < 0) return toast.error('Selecione o produto e informe pesos válidos.');
    setSaving(true);
    try {
      const { error } = await supabase.from('item_pesos').upsert({ item_id: item.id, user_id: data.userId, tipo, peso_unitario_g: unitG, tara_recipiente_g: tareG }, { onConflict: 'user_id,item_id' });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: weightCountingOptions.queryKey });
      toast.success('Tara e peso da peça cadastrados.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a tara.'); }
    finally { setSaving(false); }
  };

  const addCount = async (replace = false) => {
    if (!item || !result || dirty || !inventoryId || inventory.data?.inventory.status !== 'Em andamento' || savingCount) return;
    setSavingCount(true);
    try {
      const saved = await saveCount({ data: { inventoryId, itemId: item.id, grossG, replace } });
      if (saved.needsConfirmation) { setReplaceOpen(true); return; }
      setReplaceOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['weight-inventory', inventoryId] });
      toast.success(`${item.produto}: ${numberFormat.format(saved.quantity)} peças salvas no inventário e no histórico.`);
      setScaleWeight('');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a pesagem.'); }
    finally { setSavingCount(false); }
  };

  return <AppShell title="Balança" compact>
    <div className="flex items-center gap-2 mb-2"><Scale className="size-6 shrink-0 text-primary" /><div className="min-w-0"><h2 className="text-base font-semibold">Contagem por peso</h2><p className="text-xs text-muted-foreground">Parafusos · Porcas · Arruelas</p></div></div>
    <Tabs value={view} onValueChange={setView} className="scale-workspace">
    <TabsList aria-label="Contagem por peso" className="grid grid-cols-2 w-full h-12 mb-2 rounded-md">
      <TabsTrigger value="contagem" className="h-10 gap-2"><Scale className="size-4" />Contagem</TabsTrigger>
      <TabsTrigger value="cadastro" className="h-10 gap-2"><ClipboardList className="size-4" />Cadastro</TabsTrigger>
    </TabsList>
    {view === 'contagem' && <WeightInventoryPanel inventoryId={inventoryId} onChange={id => { setScaleWeight(''); navigate({ to: '/teste', search: { inventario: id || undefined }, replace: true }); }} />}
    <section className="space-y-2">
      <label className="block space-y-1.5"><span className="text-sm font-medium">Buscar código ou descrição</span><input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Código, part number ou descrição" /></label>
      <label className="block space-y-1.5"><span className="text-sm font-medium">Código do produto</span><select className={inputClass} value={itemId} onChange={e => setItemId(e.target.value)}><option value="">Selecionar produto</option>{filtered.map(i => <option key={i.id} value={i.id}>{i.produto} — {i.designacao}</option>)}</select></label>
      {!data.items.length && <p className="text-sm text-muted-foreground">Nenhum produto cadastrado.</p>}
      {search && !filtered.length && <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>}
      {item && <dl aria-label="Informações do produto" className="border-y border-border py-2 space-y-1 text-xs break-words">
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 items-start"><dt className="text-muted-foreground">Part Number</dt><dd className="text-right font-medium">{item.part_number || '—'}</dd></div>
        <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 items-start"><dt className="text-muted-foreground">Designação</dt><dd className="text-right font-medium">{item.designacao || '—'}</dd></div>
        <div className="grid grid-cols-3 gap-2">
          <div className="min-w-0 rounded-md bg-muted p-2"><dt className="text-[10px] uppercase text-muted-foreground">Qtd sistema</dt><dd className="font-medium mt-1 tabular-nums">{numberFormat.format(Number(item.quantidade_un))} {item.unidade_un || 'UN'}</dd></div>
          <div className="min-w-0 rounded-md bg-muted p-2"><dt className="text-[10px] uppercase text-muted-foreground">Localização</dt><dd className="font-medium mt-1">{item.localizacao || '—'}</dd></div>
          <div className="min-w-0 rounded-md bg-muted p-2"><dt className="text-[10px] uppercase text-muted-foreground">Preço médio</dt><dd className="font-medium mt-1 tabular-nums">{brl(item.preco_medio_pond)}</dd></div>
        </div>
      </dl>}
    </section>
    {item && <>
      <TabsContent value="cadastro">
      <form onSubmit={save} className="py-6 space-y-4 border-b border-border">
        <h3 className="font-semibold">Cadastro de tara / referência de peso</h3>
        <label className="block space-y-1.5"><span className="text-sm font-medium">Tipo de material</span><select className={inputClass} value={tipo} onChange={e => setTipo(e.target.value)}><option value="parafuso">Parafuso</option><option value="porca">Porca</option><option value="arruela">Arruela</option></select></label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1.5"><span className="text-sm font-medium">Peso de uma peça (g)</span><input className={inputClass} inputMode="decimal" value={unitWeight} onChange={e => setUnitWeight(e.target.value)} placeholder="Ex.: 2,5" required /></label>
          <label className="block space-y-1.5"><span className="text-sm font-medium">Tara do recipiente vazio (g)</span><input className={inputClass} inputMode="decimal" value={containerTare} onChange={e => setContainerTare(e.target.value)} required /></label>
        </div>
        <details className="text-sm"><summary className="cursor-pointer py-2 font-medium">Calibrar peso por amostra</summary><div className="grid sm:grid-cols-2 gap-3 pt-3"><label className="block space-y-1.5"><span>Peso líquido da amostra (g)</span><input className={inputClass} inputMode="decimal" value={sampleWeight} onChange={e => setSampleWeight(e.target.value)} /></label><label className="block space-y-1.5"><span>Quantidade de peças na amostra</span><input className={inputClass} inputMode="numeric" value={sampleCount} onChange={e => setSampleCount(e.target.value)} /></label></div><Button type="button" variant="secondary" className="mt-3 h-12" onClick={calibrate}>Calcular peso por peça</Button></details>
        <Button className="w-full h-12" disabled={saving}><Save />{saving ? 'Salvando…' : 'Salvar tara e peso da peça'}</Button>
      </form>
      </TabsContent>
      <TabsContent value="contagem">
       <section className="py-2 space-y-2">
        <h3 className="font-semibold">Pesagem</h3>
        {!config ? <div className="space-y-3"><p className="text-sm text-muted-foreground">Tara ainda não cadastrada para este produto.</p><Button variant="outline" className="h-12 w-full" onClick={() => setView('cadastro')}><ClipboardList className="size-4" />Cadastrar tara</Button></div> : <>
          <p className="text-sm text-muted-foreground">Peso por peça: {numberFormat.format(Number(config.peso_unitario_g))} g · Tara: {numberFormat.format(Number(config.tara_recipiente_g))} g</p>
          {dirty && <p role="status" className="text-sm text-destructive">Salve as alterações antes da pesagem.</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3"><label className="block space-y-1.5"><span className="text-sm font-medium">Peso indicado na balança</span><input className={inputClass} inputMode="decimal" value={scaleWeight} onChange={e => setScaleWeight(e.target.value)} placeholder="0,000" /></label><label className="block space-y-1.5"><span className="text-sm font-medium">Unidade</span><select className={inputClass} value={scaleUnit} onChange={e => setScaleUnit(e.target.value)}><option value="g">g</option><option value="kg">kg</option></select></label></div>
          {scaleWeight && !result && <p role="alert" className="text-sm text-destructive">Peso inválido ou menor que a tara do recipiente.</p>}
          <div aria-live="polite" aria-atomic="true" className="border-y border-border py-2 text-center"><p className="text-xs text-muted-foreground">Quantidade estimada</p><p className="text-4xl font-bold text-primary tabular-nums py-1">{result && !dirty ? numberFormat.format(result.quantity) : '—'} <span className="text-sm font-medium">peças</span></p>{result && !dirty && <p className="text-xs text-muted-foreground">Peso líquido: {numberFormat.format(result.netG)} g</p>}</div>
          <div className="grid grid-cols-[44px_minmax(0,1fr)] gap-2"><Button variant="outline" size="icon" className="h-11 w-11" disabled={savingCount} onClick={() => setScaleWeight('')} aria-label="Nova pesagem" title="Nova pesagem"><RotateCcw /></Button><Button className="h-11 min-w-0" disabled={!result || Boolean(dirty) || savingCount || inventory.data?.inventory.status !== 'Em andamento'} onClick={() => void addCount()}><Save />{savingCount ? 'Salvando…' : 'Adicionar à contagem'}</Button></div>
          <p className="text-[11px] leading-tight text-muted-foreground">Estimativa sujeita à variação das peças e precisão da balança. Use tara 0 g se a balança já estiver tarada.</p>
        </>}
      </section>
      </TabsContent>
    </>}
    </Tabs>
    <Dialog open={replaceOpen} onOpenChange={open => { if (!savingCount) setReplaceOpen(open); }}>
      <DialogContent className="w-[calc(100%-24px)] rounded-lg"><DialogTitle>Produto já contado</DialogTitle><DialogDescription>Substituir a quantidade já salva por {result ? numberFormat.format(result.quantity) : '—'} peças? A nova pesagem não será somada à anterior.</DialogDescription><div className="grid grid-cols-2 gap-2"><Button variant="outline" disabled={savingCount} onClick={() => setReplaceOpen(false)}>Cancelar</Button><Button disabled={savingCount} onClick={() => void addCount(true)}>{savingCount ? 'Salvando…' : 'Substituir'}</Button></div></DialogContent>
    </Dialog>
  </AppShell>;
}
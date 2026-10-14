import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Play, Search, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { inventorySetupOptions } from '@/lib/inventory-setup.queries';
import { createInventoryWithItems } from '@/lib/inventory-setup.functions';
import { emptyInventoryRow, parseInventoryExcel, type InventoryRow } from '@/lib/inventory-setup';
import { sortInventoryRows } from '@/lib/inventory-order';
import { ListPagination } from '@/components/ListPagination';

const inputClass = 'w-full min-w-0 rounded-md border border-input bg-card px-3 py-2.5 text-base';
export function InventorySetup({ onCreated }: { onCreated: (id: string) => void }) {
  const catalog = useQuery(inventorySetupOptions);
  const queryClient = useQueryClient();
  const create = useServerFn(createInventoryWithItems);
  const [name, setName] = useState('');
  const [responsible, setResponsible] = useState('');
  const [date, setDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [observation, setObservation] = useState('');
  const [source, setSource] = useState<'manual' | 'excel'>('manual');
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [catalogPage, setCatalogPage] = useState(0);
  const [selectedPage, setSelectedPage] = useState(0);
  const pageSize = 25;
  const [createMissing, setCreateMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (catalog.data?.responsible) setResponsible(current => current || catalog.data.responsible); }, [catalog.data?.responsible]);
  const items = catalog.data?.items ?? [];
  const products = useMemo(() => new Map(items.map(item => [item.produto, item])), [items]);
  const selectedCodes = useMemo(() => new Set(rows.map(row => row.produto)), [rows]);
  const missing = useMemo(() => rows.filter(row => !products.has(row.produto)), [rows, products]);
  const filtered = useMemo(() => items.filter(item => `${item.produto} ${item.designacao} ${item.part_number}`.toLowerCase().includes(deferredSearch.toLowerCase())), [items, deferredSearch]);
  useEffect(() => setCatalogPage(0), [deferredSearch]);
  const safeCatalogPage = Math.min(catalogPage, Math.max(0, Math.ceil(filtered.length / pageSize) - 1));
  const safeSelectedPage = Math.min(selectedPage, Math.max(0, Math.ceil(rows.length / pageSize) - 1));
  const update = (code: string, patch: Partial<InventoryRow>) => setRows(current => current.map(row => row.produto === code ? { ...row, ...patch } : row));
  const importFile = async (file: File) => {
    setBusy(true); setError('');
    try { setRows(sortInventoryRows(await parseInventoryExcel(file))); setCreateMissing(false); }
    catch (e) { setRows([]); setError(e instanceof Error ? e.message : 'Não foi possível ler o Excel.'); }
    finally { setBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    if (missing.length && !createMissing) return setError('Confirme o cadastro automático dos produtos novos.');
    if (missing.some(row => !row.designacao.trim())) return setError('Informe a descrição de todos os produtos novos.');
    setBusy(true);
    try {
      const result = await create({ data: { name, responsible, date, observation, source, rows, createMissing } });
      void queryClient.invalidateQueries({ queryKey: ['weight-inventories'] });
      if (missing.length && createMissing) {
        void queryClient.invalidateQueries({ queryKey: ['weight-counting'] });
        void queryClient.invalidateQueries({ queryKey: inventorySetupOptions.queryKey });
      }
      toast.success(rows.length ? 'Inventário iniciado com os produtos selecionados.' : 'Inventário iniciado.'); onCreated(result.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível iniciar o inventário.'); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-4">
    <label className="block space-y-1"><span className="text-sm font-medium">Nome do inventário</span><input className={inputClass} required maxLength={200} value={name} onChange={e => setName(e.target.value)} /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block space-y-1"><span className="text-sm font-medium">Data</span><input type="date" className={inputClass} required value={date} onChange={e => setDate(e.target.value)} /></label><label className="block space-y-1"><span className="text-sm font-medium">Responsável</span><input className={inputClass} required maxLength={200} value={responsible} onChange={e => setResponsible(e.target.value)} /></label></div>
    <label className="block space-y-1"><span className="text-sm font-medium">Observação</span><textarea className={inputClass} maxLength={5000} value={observation} onChange={e => setObservation(e.target.value)} /></label>
    <fieldset disabled={busy} className="space-y-3 border-t border-border pt-3">
      <legend className="font-semibold">Produtos do inventário</legend>
      <div className="grid grid-cols-2 gap-2"><Button type="button" variant={source === 'manual' ? 'default' : 'outline'} onClick={() => { setSource('manual'); setRows([]); setError(''); setCreateMissing(false); }}>Selecionar produtos</Button><Button type="button" variant={source === 'excel' ? 'default' : 'outline'} onClick={() => { setSource('excel'); setRows([]); setError(''); setCreateMissing(false); }}><Upload />Excel</Button></div>
      {catalog.isPending && <p role="status">Carregando produtos…</p>}
      {catalog.isError && <p role="alert" className="text-destructive">Não foi possível carregar o cadastro.<Button type="button" variant="outline" onClick={() => void catalog.refetch()}>Tentar novamente</Button></p>}
      {source === 'manual' ? <>
        <label className="flex items-center gap-2"><Search className="size-5 shrink-0 text-muted-foreground" /><input aria-label="Buscar produtos para o inventário" className={inputClass} placeholder="Código ou descrição" value={search} onChange={e => setSearch(e.target.value)} /></label>
        <div className="max-h-56 overflow-y-auto border-y border-border divide-y divide-border">{filtered.slice(safeCatalogPage * pageSize, (safeCatalogPage + 1) * pageSize).map(item => <label key={item.id} className="flex items-center gap-3 py-3"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={selectedCodes.has(item.produto)} onChange={e => setRows(current => e.target.checked ? [...current, emptyInventoryRow(item)] : current.filter(row => row.produto !== item.produto))} /><span className="min-w-0 break-words"><strong>{item.produto}</strong> — {item.designacao}</span></label>)}{!filtered.length && <p className="py-4 text-muted-foreground">Nenhum produto encontrado.</p>}</div>
        <ListPagination page={safeCatalogPage} total={filtered.length} pageSize={pageSize} onChange={setCatalogPage} />
      </> : <label className="block space-y-2"><span className="text-sm font-medium">Arquivo Excel</span><input type="file" accept=".xlsx,.xls" className={`${inputClass} file:mr-3`} onChange={e => { const file = e.target.files?.[0]; if (file) void importFile(file); e.target.value = ''; }} /><span className="block text-xs text-muted-foreground break-words">Colunas: produto, designacao, part_number, quantidade_un, unidade_un, localizacao, preco_medio_pond, observacao. Valor é o preço unitário.</span></label>}
      <h3 className="font-semibold">Selecionados ({rows.length})</h3>
      <ul className="space-y-3">{rows.slice(safeSelectedPage * pageSize, (safeSelectedPage + 1) * pageSize).map(row => {
        const product = products.get(row.produto);
        return <li key={row.produto} className="rounded-md border border-border p-3 space-y-3">
          <div className="flex items-start gap-2"><div className="min-w-0 flex-1 break-words"><strong className="text-primary">{row.produto}</strong><p className="text-sm">{product?.designacao ?? row.designacao}</p>{!product && <span className="text-xs text-warning-foreground">Novo produto</span>}</div><Button type="button" variant="ghost" size="icon" aria-label={`Remover ${row.produto}`} onClick={() => setRows(current => current.filter(r => r.produto !== row.produto))}><X /></Button></div>
          {!product && <label className="block space-y-1 text-sm">Descrição do novo produto<input className={inputClass} value={row.designacao} required onChange={e => update(row.produto, { designacao: e.target.value })} /></label>}
          <div className="grid grid-cols-2 gap-3">{source === 'excel' && <><label className="block text-sm space-y-1">Qtd sistema<input type="number" min="0" step="any" required className={inputClass} value={row.quantidade_un} onChange={e => update(row.produto, { quantidade_un: e.target.valueAsNumber })} /></label><label className="block text-sm space-y-1">Preço unitário (R$)<input type="number" min="0" step="any" required className={inputClass} value={row.preco_medio_pond} onChange={e => update(row.produto, { preco_medio_pond: e.target.valueAsNumber })} /></label><label className="block text-sm space-y-1">Localização<input className={inputClass} value={row.localizacao} onChange={e => update(row.produto, { localizacao: e.target.value })} /></label></>}<label className="block text-sm space-y-1">Unidade<input className={inputClass} value={row.unidade_un} onChange={e => update(row.produto, { unidade_un: e.target.value })} /></label></div>
          <label className="block text-sm space-y-1">Observação do item<input className={inputClass} value={row.observacao} onChange={e => update(row.produto, { observacao: e.target.value })} /></label>
        </li>;
      })}</ul>
      <ListPagination page={safeSelectedPage} total={rows.length} pageSize={pageSize} onChange={setSelectedPage} />
      {missing.length > 0 && <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="size-5 shrink-0 accent-primary" checked={createMissing} onChange={e => setCreateMissing(e.target.checked)} /><span>Cadastrar automaticamente os {missing.length} novos produtos, sem gravar quantidade, preço ou localização no cadastro.</span></label>}
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button className="w-full h-12" disabled={busy}><Play />{busy ? 'Processando…' : 'Iniciar inventário'}</Button>
  </form>;
}
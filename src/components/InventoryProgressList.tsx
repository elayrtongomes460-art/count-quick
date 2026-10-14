import { useState } from 'react';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { brl } from '@/lib/format';
import { inventoryProgress, remainingQuantity, type ProgressItem } from '@/lib/inventory-progress';
import { sortInventoryRows, type InventoryOrder } from '@/lib/inventory-order';

type InventoryRow = ProgressItem & {
  id: string; produto: string; designacao: string | null; part_number: string | null;
  unidade_un: string | null; localizacao: string | null; preco_medio_pond: number;
  observacao?: string;
};
const quantity = (value: number) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 6 });
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function InventoryProgressList({ items, loading, error, onClose, name, showReferences = true }: {
  items: InventoryRow[]; loading: boolean; error: string | null; onClose: () => void; name: string; showReferences?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [order, setOrder] = useState<InventoryOrder>('produto');
  const progress = inventoryProgress(items);
  const query = normalize(search);
  const visible = sortInventoryRows(items.filter(row =>
    (filter === 'all' || (filter === 'counted' ? row.contado : !row.contado)) &&
    normalize([row.produto, row.designacao, row.part_number, row.localizacao].join(' ')).includes(query)
  ), order);
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent className="flex flex-col w-[calc(100%-1rem)] max-w-3xl max-h-[90dvh] gap-3 p-4 rounded-lg overflow-hidden">
        <DialogHeader className="text-left pr-7 shrink-0">
          <DialogTitle>Itens do inventário</DialogTitle>
          <DialogDescription className="break-words">{name}</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-3 gap-2 border-y border-border py-3 text-center shrink-0">
          <Summary label="Total de itens" value={progress.total} />
          <Summary label="Contados" value={progress.counted} tone="text-success" />
          <Summary label="Faltam contar" value={progress.pending} tone="text-destructive" />
        </dl>
        <div className="relative shrink-0">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input aria-label="Buscar itens do inventário" placeholder="Código, descrição ou localização" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-10" />
        </div>
        <Tabs value={filter} onValueChange={setFilter} className="shrink-0">
          <TabsList className="grid grid-cols-3 w-full h-10">
            <TabsTrigger value="all" className="px-1">Todos</TabsTrigger>
            <TabsTrigger value="counted" className="px-1">Contados</TabsTrigger>
            <TabsTrigger value="pending" className="px-1">Pendentes</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm shrink-0">
          <span className="text-muted-foreground">Ordenar por</span>
          <select aria-label="Ordenar itens" value={order} onChange={event => setOrder(event.target.value === 'localizacao' ? 'localizacao' : 'produto')} className="min-w-0 flex-1 h-10 rounded-md border border-input bg-card px-3 text-foreground">
            <option value="produto">Código do produto</option>
            <option value="localizacao">Localização</option>
          </select>
        </label>
        <div className="min-h-0 overflow-y-auto flex-1 space-y-2" role="region" aria-label="Lista de itens do inventário">
          {loading && <p role="status" className="py-8 text-center text-muted-foreground">Carregando itens…</p>}
          {!loading && error && <p role="alert" className="py-6 text-center text-destructive">{error}</p>}
          {!loading && !error && visible.length === 0 && <p className="py-8 text-center text-muted-foreground">{items.length ? 'Nenhum item encontrado.' : 'Nenhum item vinculado a este inventário.'}</p>}
          {!loading && !error && visible.map(row => (
            <article key={row.id} className="border border-border bg-card rounded-lg p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-mono font-semibold text-primary break-all">{row.produto}</h3>
                  <p className="text-sm break-words">{row.designacao || '—'}</p>
                  {row.part_number && <p className="text-xs text-muted-foreground break-all">Part Number: {row.part_number}</p>}
                </div>
                <span className={`shrink-0 text-xs font-semibold ${row.contado ? 'text-success' : 'text-destructive'}`}>{row.contado ? 'Contado' : 'Pendente'}</span>
              </div>
              <dl className={`grid gap-x-2 gap-y-3 text-sm ${showReferences ? 'grid-cols-3' : 'grid-cols-1'}`}>
                {showReferences && <Detail label="Qtd. arquivo / sistema" value={`${quantity(row.quantidade_un_sistema)} ${row.unidade_un || 'UN'}`} />}
                <Detail label="Qtd. contada" value={row.contado ? `${quantity(row.quantidade_contada)} ${row.unidade_un || 'UN'}` : '—'} />
                {showReferences && <Detail label="Qtd. faltante" value={`${quantity(remainingQuantity(row))} ${row.unidade_un || 'UN'}`} />}
                {showReferences && <Detail label="Localização" value={row.localizacao || '—'} />}
                {showReferences && <Detail label="Preço médio ponderado" value={brl(row.preco_medio_pond)} />}
                {showReferences && <Detail label="Diferença" value={row.contado ? quantity(Number(row.quantidade_contada) - Number(row.quantidade_un_sistema)) : '—'} />}
              </dl>
              {row.observacao && <p className="text-xs text-muted-foreground break-words">Observação: {row.observacao}</p>}
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
function Summary({ label, value, tone = 'text-foreground' }: { label: string; value: number; tone?: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`text-2xl font-bold ${tone}`}>{quantity(value)}</dd></div>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="font-medium break-words">{value}</dd></div>;
}
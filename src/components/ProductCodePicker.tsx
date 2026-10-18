import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react';
import { inventorySetupOptions } from '@/lib/inventory-setup.queries';

export type CatalogItem = {
  id: string;
  produto: string;
  part_number: string | null;
  designacao: string | null;
  especificacoes: string | null;
  unidade_un: string | null;
};

const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const MAX_ROWS = 30;

export function ProductCodePicker({
  value, onChange, dark = false, label, required = false, invalid = false, id, placeholder,
}: {
  value: string;
  onChange: (code: string) => void;
  dark?: boolean;
  label?: string;
  required?: boolean;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const catalog = useQuery(inventorySetupOptions);
  const items = useMemo(() => (catalog.data?.items ?? []) as unknown as CatalogItem[], [catalog.data]);
  const deferred = useDeferredValue(value);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const matches = useMemo(() => {
    const term = fold(deferred.trim());
    if (!term) return items.slice(0, MAX_ROWS);
    const out: CatalogItem[] = [];
    for (const item of items) {
      if (out.length >= MAX_ROWS) break;
      if (fold(`${item.produto} ${item.designacao ?? ''} ${item.part_number ?? ''}`).includes(term)) out.push(item);
    }
    return out;
  }, [items, deferred]);

  const chosen = useMemo(() => items.find((item) => item.produto === value.trim()) ?? null, [items, value]);

  useEffect(() => setActive(0), [deferred]);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const pick = (item: CatalogItem) => { onChange(item.produto); setOpen(false); };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      const next = active + (event.key === 'ArrowDown' ? 1 : -1);
      setActive(Math.min(Math.max(next, 0), Math.max(matches.length - 1, 0)));
      return;
    }
    if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); pick(matches[active]); }
  };

  const showList = open && !catalog.isPending;
  const border = invalid && required
    ? (dark ? 'border-amber-300/70' : 'border-destructive')
    : (dark ? 'border-white/20' : 'border-border');

  return (
    <div ref={wrapRef} className="relative">
      {label && (
        <span className={`block mb-1 uppercase tracking-wide ${dark ? 'text-[11px] text-white/70' : 'text-xs text-muted-foreground'}`}>
          {label}
          {required && <span className={dark ? 'text-amber-300' : 'text-destructive'}> *</span>}
        </span>
      )}

      <div className={`flex items-center gap-1 rounded-lg border ${border}`}>
        <Search className={`size-4 shrink-0 ml-2 ${dark ? 'text-white/50' : 'text-muted-foreground'}`} />
        <input
          id={id}
          aria-label={label}
          role="combobox"
          aria-expanded={open}
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          className={`w-full min-w-0 bg-transparent px-2 py-2 rounded-lg outline-none ${
            dark ? 'bg-white/10 text-sm text-white placeholder:text-white/50 focus:border-accent' : 'text-base text-foreground placeholder:text-muted-foreground'
          }`}
        />
        <button
          type="button"
          aria-label="Selecionar produto da lista"
          onClick={() => setOpen((v) => !v)}
          className={`px-2 py-2 rounded-r-lg ${dark ? 'text-white/60 hover:text-white' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <ChevronsUpDown className="size-4" />
        </button>
      </div>

      {catalog.isPending && (
        <p className={`mt-1 flex items-center gap-2 text-xs ${dark ? 'text-white/60' : 'text-muted-foreground'}`}>
          <Loader2 className="size-3.5 animate-spin" /> Carregando produtos…
        </p>
      )}
      {catalog.isError && <p className="mt-1 text-xs text-destructive">Não foi possível carregar o cadastro de itens.</p>}

      {showList && (
        <div className={`mt-1 max-h-48 overflow-y-auto rounded-lg border text-sm ${dark ? 'bg-black/85 border-white/15' : 'bg-card border-border shadow-lg'}`}>
          {!matches.length && (
            <p className={`px-3 py-2 ${dark ? 'text-white/60' : 'text-muted-foreground'}`}>Nenhum produto encontrado.</p>
          )}
          {matches.map((item, index) => {
            const isChosen = item.produto === value.trim();
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => pick(item)}
                onMouseEnter={() => setActive(index)}
                className={`w-full flex items-start gap-2 px-3 py-2 text-left ${
                  index === active ? (dark ? 'bg-white/10' : 'bg-muted') : ''
                } ${isChosen ? (dark ? 'text-accent' : 'text-primary') : ''}`}
              >
                {isChosen
                  ? <Check className={`size-4 mt-0.5 shrink-0 ${dark ? 'text-accent' : 'text-primary'}`} />
                  : <span className="size-4 mt-0.5 shrink-0" />}
                <span className="min-w-0 break-words">
                  <strong className={dark ? 'text-white' : 'text-foreground'}>{item.produto}</strong>
                  {item.designacao && (
                    <span className={dark ? 'text-white/70' : 'text-muted-foreground'}> — {item.designacao}</span>
                  )}
                </span>
              </button>
            );
          })}
          {matches.length >= MAX_ROWS && (
            <p className={`px-3 py-2 text-[11px] ${dark ? 'text-white/50' : 'text-muted-foreground'}`}>
              Mostrando {MAX_ROWS} produtos — digite mais para refinar a busca.
            </p>
          )}
        </div>
      )}

      {chosen && (
        <div className={`mt-1 text-xs break-words ${dark ? 'text-white/80' : 'text-muted-foreground'}`}>
          <div><span className="opacity-70">Descrição:</span> {chosen.designacao || '—'}</div>
          {chosen.part_number && <div><span className="opacity-70">Part Number:</span> {chosen.part_number}</div>}
        </div>
      )}
    </div>
  );
}

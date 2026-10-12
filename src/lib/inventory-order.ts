export type InventoryOrder = 'produto' | 'localizacao';
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export function sortInventoryRows<T extends { produto: string; localizacao?: string | null }>(rows: readonly T[], order: InventoryOrder = 'produto'): T[] {
  return [...rows].sort((a, b) => {
    const first = (a[order] ?? '').trim();
    const second = (b[order] ?? '').trim();
    if (!first && second) return 1;
    if (first && !second) return -1;
    return collator.compare(first, second) || collator.compare(a.produto, b.produto);
  });
}
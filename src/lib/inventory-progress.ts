export type ProgressItem = {
  contado: boolean;
  quantidade_un_sistema: number;
  quantidade_contada: number;
};

export function remainingQuantity(item: ProgressItem) {
  return Math.max(0, Number(item.quantidade_un_sistema) - (item.contado ? Number(item.quantidade_contada) : 0));
}

export function inventoryProgress(items: ProgressItem[]) {
  const counted = items.filter(item => item.contado).length;
  return { total: items.length, counted, pending: items.length - counted };
}
export function parseWeight(value: string): number {
  if (!/^\d+(?:[.,]\d+)?$/.test(value.trim())) return NaN;
  return Number(value.trim().replace(',', '.'));
}

export function countByWeight(grossG: number, tareG: number, unitG: number) {
  if (![grossG, tareG, unitG].every(Number.isFinite) || grossG < 0 || tareG < 0 || unitG <= 0 || grossG < tareG) return null;
  const netG = grossG - tareG;
  const exact = netG / unitG;
  const quantity = Math.round(exact);
  if (!Number.isSafeInteger(quantity)) return null;
  return { netG, exact, quantity, residualG: netG - quantity * unitG };
}
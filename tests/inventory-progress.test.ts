import { describe, expect, test } from 'bun:test';
import { inventoryProgress, remainingQuantity } from '../src/lib/inventory-progress';

describe('inventory list progress', () => {
  test('counts confirmed zero quantities separately from pending products', () => {
    expect(inventoryProgress([
      { contado: true, quantidade_un_sistema: 5, quantidade_contada: 0 },
      { contado: false, quantidade_un_sistema: 10, quantidade_contada: 0 },
    ])).toEqual({ total: 2, counted: 1, pending: 1 });
  });
  test('shows remaining reference quantity without negative values for excess counts', () => {
    expect(remainingQuantity({ contado: true, quantidade_un_sistema: 10, quantidade_contada: 3 })).toBe(7);
    expect(remainingQuantity({ contado: true, quantidade_un_sistema: 10, quantidade_contada: 12 })).toBe(0);
    expect(remainingQuantity({ contado: false, quantidade_un_sistema: 10, quantidade_contada: 3 })).toBe(10);
  });
  test('handles an empty inventory', () => {
    expect(inventoryProgress([])).toEqual({ total: 0, counted: 0, pending: 0 });
  });
});
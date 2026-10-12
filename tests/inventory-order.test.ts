import { describe, expect, test } from 'bun:test';
import { sortInventoryRows } from '../src/lib/inventory-order';

describe('inventory natural order', () => {
  test('orders codes numerically without changing source rows or leading zeroes', () => {
    const rows = [{ produto: 'OI-00151' }, { produto: 'OI-00150' }, { produto: 'OI-2' }, { produto: 'OI-10' }];
    expect(sortInventoryRows(rows).map(row => row.produto)).toEqual(['OI-2', 'OI-10', 'OI-00150', 'OI-00151']);
    expect(rows[0].produto).toBe('OI-00151');
  });
  test('orders locations naturally, resolves ties by code and puts blank locations last', () => {
    const rows = [
      { produto: 'D', localizacao: '' }, { produto: 'C', localizacao: 'A01E01P03' },
      { produto: 'B', localizacao: 'A01E01P02' }, { produto: 'A', localizacao: 'A01E01P01' },
      { produto: 'Z', localizacao: 'A01E01P2' },
    ];
    expect(sortInventoryRows(rows, 'localizacao').map(row => row.produto)).toEqual(['A', 'B', 'Z', 'C', 'D']);
  });
});
import { describe, expect, test } from 'bun:test';
import { emptyInventoryRow, parseInventoryObjects, referenceNumber } from '../src/lib/inventory-setup';

describe('inventory-specific product references', () => {
  test('manual selection never copies permanent stock, price or location', () => {
    const product = { produto: '00123', designacao: 'Porca', quantidade_un: 900, preco_medio_pond: 99, localizacao: 'OLD' };
    expect(emptyInventoryRow(product)).toMatchObject({ produto: '00123', quantidade_un: 0, preco_medio_pond: 0, localizacao: '' });
  });
  test('imports code-only rows and localized reference values', () => {
    expect(parseInventoryObjects([{ Código: '00123', Quantidade: '1.234,5', Valor: 'R$ 2,75', Localização: 'A01' }])[0]).toMatchObject({ produto: '00123', designacao: '', quantidade_un: 1234.5, preco_medio_pond: 2.75, localizacao: 'A01' });
  });
  test('rejects duplicates, missing codes and invalid numbers rather than losing rows', () => {
    expect(() => parseInventoryObjects([{ produto: 'A' }, { produto: 'A' }])).toThrow('repetido');
    expect(() => parseInventoryObjects([{ descricao: 'Porca' }])).toThrow('código');
    expect(() => referenceNumber('=1+2')).toThrow();
    expect(() => referenceNumber('abc')).toThrow();
  });
  test('retains precise numeric cells and optional observations', () => {
    expect(parseInventoryObjects([{ produto: 'A', quantidade_un: 2.123456, observacao: 'Lote 2' }])[0]).toMatchObject({ quantidade_un: 2.123456, observacao: 'Lote 2' });
  });
});
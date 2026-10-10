import { describe, expect, test } from 'bun:test';
import { countByWeight, parseWeight } from '../src/lib/weight-counting';

describe('contagem por peso', () => {
  test('desconta tara e divide pelo peso de uma peça', () => {
    expect(countByWeight(1050, 50, 10)?.quantity).toBe(100);
    expect(countByWeight(1000, 0, 2.5)?.quantity).toBe(400);
  });
  test('arredonda a estimativa e mantém o resíduo', () => {
    expect(countByWeight(26, 0, 10)).toEqual({ netG: 26, exact: 2.6, quantity: 3, residualG: -4 });
  });
  test('rejeita pesos inválidos', () => {
    for (const input of [[10, 20, 1], [10, 0, 0], [-1, 0, 2], [NaN, 0, 2], [10, -1, 2]]) {
      expect(countByWeight(input[0], input[1], input[2])).toBeNull();
    }
    expect(countByWeight(0, 0, 2)?.quantity).toBe(0);
  });
  test('aceita vírgula decimal sem aceitar caracteres inválidos', () => {
    expect(parseWeight('2,75')).toBe(2.75);
    expect(parseWeight('1.25')).toBe(1.25);
    expect(parseWeight('')).toBeNaN();
    expect(parseWeight('1,2,3')).toBeNaN();
  });
});
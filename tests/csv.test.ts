import { describe, expect, test } from 'bun:test';
import { csvCell, serializeCsv } from '../src/lib/csv';

describe('safe item and inventory CSV exports', () => {
  test('neutralizes formula prefixes in untrusted text', () => {
    for (const text of ['=HYPERLINK("https://example.invalid")', '+SUM(1,2)', '-1+2', '@SUM(1,2)', '＝1+2', '＋1', '＠SUM(1)', '－1']) {
      expect(csvCell(text)).toBe(`"'${text.replace(/"/g, '""')}"`);
    }
  });

  test('neutralizes formulas hidden behind whitespace or control characters', () => {
    for (const text of ['  =1+2', '\t=1+2', '\r+1', '\n@SUM(1)', '\u0000-1+2', '\ufeff=1', '\tplain']) {
      expect(csvCell(text)).toBe(`"'${text}"`);
    }
  });

  test('preserves real numbers, codes, separators, quotes, and empty values', () => {
    expect(csvCell(-12.5)).toBe('"-12.5"');
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell('-12.5')).toBe('"\'-12.5"');
    expect(csvCell('00123')).toBe('"00123"');
    expect(csvCell('Parafuso; "A"\nB')).toBe('"Parafuso; ""A""\nB"');
    expect(csvCell(null)).toBe('""');
  });

  test('protects every text column and inventory metadata with the same serializer', () => {
    expect(serializeCsv([
      ['Inventario', '=1+2'],
      ['Responsavel', ' @SUM(1)'],
      [],
      ['Produto', 'Designacao', 'Diferenca'],
      ['+CODE', '=1+2', -5],
    ])).toBe('"Inventario";"\'=1+2"\n"Responsavel";"\' @SUM(1)"\n\n"Produto";"Designacao";"Diferenca"\n"\'+CODE";"\'=1+2";"-5"');
  });
});
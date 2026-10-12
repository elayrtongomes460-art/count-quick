import { describe, expect, test } from 'bun:test';
import { readAllPages } from '../src/lib/paged-read';

describe('bounded complete pagination', () => {
  test('returns every row in stable page order, including beyond the API limit', async () => {
    const source = Array.from({ length: 17564 }, (_, index) => index);
    let active = 0;
    let peak = 0;
    const rows = await readAllPages(async (from, to) => {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, from % 3));
      active--;
      return { data: source.slice(from, to + 1), error: null };
    });
    expect(rows).toEqual(source);
    expect(peak).toBe(4);
  });
  test('handles empty and exact-multiple catalogs', async () => {
    expect(await readAllPages(async () => ({ data: [], error: null }))).toEqual([]);
    const source = [0, 1, 2, 3];
    expect(await readAllPages(async (from, to) => ({ data: source.slice(from, to + 1), error: null }), 2, 2)).toEqual(source);
  });
  test('rejects failed pages instead of exposing a truncated catalog', async () => {
    await expect(readAllPages(async from => from === 1000 ? { data: null, error: { message: 'offline' } } : { data: Array(1000).fill(0), error: null })).rejects.toThrow('offline');
  });
});
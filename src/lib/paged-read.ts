/** Read every ordered page with bounded concurrency, without truncating catalogs. */
export async function readAllPages<T>(
  readPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  concurrency = 4,
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize < 1 || !Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error('Invalid pagination settings');
  }
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize * concurrency) {
    const pages = await Promise.all(Array.from({ length: concurrency }, (_, index) => {
      const from = offset + index * pageSize;
      return readPage(from, from + pageSize - 1);
    }));
    for (const page of pages) {
      if (page.error) throw new Error(page.error.message);
    }
    for (const page of pages) {
      const data = page.data ?? [];
      rows.push(...data);
      if (data.length < pageSize) return rows;
    }
  }
}
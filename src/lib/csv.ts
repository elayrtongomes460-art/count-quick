/** Quote a CSV cell and keep untrusted text from becoming a spreadsheet formula. */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  // Keep genuine numeric quantities/prices numeric, including negative differences.
  // Check past whitespace/control characters that spreadsheet readers may skip.
  const numeric = typeof value === 'number' && Number.isFinite(value);
  const unsafeText = /^[\s\u0000-\u001f\u007f]*[=+@\-＝＋＠－]/u.test(text)
    || /^[\t\r\n]/.test(text);
  const safe = !numeric && unsafeText ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function serializeCsv(rows: readonly (readonly unknown[])[]): string {
  return rows.map(row => row.map(csvCell).join(';')).join('\n');
}
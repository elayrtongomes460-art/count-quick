import * as XLSX from 'xlsx';

export type InventoryRow = {
  produto: string; part_number: string; designacao: string; especificacoes: string;
  quantidade_un: number; unidade_un: string; localizacao: string; preco_medio_pond: number; observacao: string;
};

export const normalizeProductCode = (value: unknown) => String(value ?? '').replace(/[\r\n\t]/g, '').replace(/\u00a0/g, ' ').trim();
const norm = (value: string) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const aliases: Record<string, keyof InventoryRow> = {
  produto: 'produto', codigo: 'produto', sku: 'produto', item: 'produto',
  part_number: 'part_number', pn: 'part_number', partnumber: 'part_number',
  designacao: 'designacao', descricao: 'designacao', nome: 'designacao',
  especificacoes: 'especificacoes', especificacao: 'especificacoes',
  quantidade: 'quantidade_un', qtd: 'quantidade_un', quantidade_un: 'quantidade_un', qtd_sistema: 'quantidade_un', estoque: 'quantidade_un',
  unidade: 'unidade_un', unidade_un: 'unidade_un', un: 'unidade_un',
  localizacao: 'localizacao', local: 'localizacao', endereco: 'localizacao',
  valor: 'preco_medio_pond', preco: 'preco_medio_pond', preco_medio: 'preco_medio_pond', preco_medio_pond: 'preco_medio_pond', valor_unitario: 'preco_medio_pond',
  observacao: 'observacao', observacoes: 'observacao',
};

export function referenceNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  let text = String(value).trim().replace(/^R\$\s*/, '').replace(/\s/g, '');
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error(`Número inválido: ${String(value)}`);
  const number = Number(text);
  if (!Number.isFinite(number) || number < 0) throw new Error('Quantidade e valor devem ser positivos ou zero.');
  return number;
}

export function emptyInventoryRow(product: { produto: string; part_number?: string | null; designacao?: string; especificacoes?: string; unidade_un?: string }): InventoryRow {
  return { produto: normalizeProductCode(product.produto), part_number: product.part_number ?? '', designacao: product.designacao ?? '', especificacoes: product.especificacoes ?? '', unidade_un: product.unidade_un || 'UN', quantidade_un: 0, preco_medio_pond: 0, localizacao: '', observacao: '' };
}

export function parseInventoryObjects(objects: Record<string, unknown>[]): InventoryRow[] {
  const codes = new Set<string>();
  return objects.filter(o => Object.values(o).some(v => v != null && String(v).trim())).map((object, index) => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(object)) { const field = aliases[norm(key)]; if (field) mapped[field] = value; }
    const code = normalizeProductCode(mapped.produto);
    if (!code) throw new Error(`Linha ${index + 2}: código do produto obrigatório.`);
    if (codes.has(code)) throw new Error(`Código ${code} repetido. Use uma linha por produto neste inventário.`);
    codes.add(code);
    return { ...emptyInventoryRow({ produto: code }), part_number: normalizeProductCode(mapped.part_number), designacao: String(mapped.designacao ?? '').trim(), especificacoes: String(mapped.especificacoes ?? '').trim(), quantidade_un: referenceNumber(mapped.quantidade_un), preco_medio_pond: referenceNumber(mapped.preco_medio_pond), unidade_un: String(mapped.unidade_un ?? 'UN').trim() || 'UN', localizacao: String(mapped.localizacao ?? '').trim(), observacao: String(mapped.observacao ?? '').trim() };
  });
}

export async function parseInventoryExcel(file: File): Promise<InventoryRow[]> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('Selecione um arquivo Excel (.xlsx ou .xls).');
  if (file.size > 20 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 20 MB.');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const objects: Record<string, unknown>[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    // Formatted code cells preserve leading zeroes; numeric cells keep their precision.
    const formatted = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
    formatted.forEach((row, index) => {
      for (const key of Object.keys(row)) if (['quantidade_un', 'preco_medio_pond'].includes(aliases[norm(key)])) row[key] = raw[index]?.[key] ?? row[key];
      objects.push(row);
    });
  }
  const rows = parseInventoryObjects(objects);
  if (!rows.length || rows.length > 10000) throw new Error('O Excel deve conter de 1 a 10000 produtos.');
  return rows;
}
import * as XLSX from "xlsx";
import mammoth from "mammoth";

export type RawRow = {
  produto: string;
  part_number: string;
  designacao: string;
  quantidade_un: number;
  unidade_un: string;
  localizacao: string;
  preco_medio_pond: number;
};

const HEADERS = ["produto", "part_number", "designacao", "quantidade_un", "unidade_un", "localizacao", "preco_medio_pond"] as const;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

const ALIASES: Record<string, (typeof HEADERS)[number]> = {
  produto: "produto", codigo: "produto", code: "produto", sku: "produto", item: "produto",
  part_number: "part_number", partnumber: "part_number", pn: "part_number", part: "part_number",
  designacao: "designacao", descricao: "designacao", description: "designacao", nome: "designacao", produto_descricao: "designacao",
  quantidade: "quantidade_un", quantidade_un: "quantidade_un", qtd: "quantidade_un", qty: "quantidade_un", quantity: "quantidade_un", estoque: "quantidade_un",
  unidade: "unidade_un", unidade_un: "unidade_un", un: "unidade_un", unit: "unidade_un",
  localizacao: "localizacao", local: "localizacao", location: "localizacao", endereco: "localizacao", posicao: "localizacao",
  preco_medio_pond: "preco_medio_pond", preco_medio: "preco_medio_pond", preco: "preco_medio_pond", price: "preco_medio_pond", valor: "preco_medio_pond", custo: "preco_medio_pond",
};

const toNum = (v: any) => {
  if (v == null) return 0;
  const s = String(v).replace(/[^\d,.\-]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return Number(s) || 0;
};

const toRow = (obj: Record<string, any>): RawRow | null => {
  const row: any = { produto: "", part_number: "", designacao: "", quantidade_un: 0, unidade_un: "UN", localizacao: "", preco_medio_pond: 0 };
  for (const [k, v] of Object.entries(obj)) {
    const key = ALIASES[norm(k)];
    if (!key) continue;
    row[key] = v;
  }
  row.produto = String(row.produto ?? "").trim();
  row.part_number = String(row.part_number ?? "").trim();
  row.designacao = String(row.designacao ?? "").trim();
  row.unidade_un = String(row.unidade_un ?? "UN").trim() || "UN";
  row.localizacao = String(row.localizacao ?? "").trim();
  row.quantidade_un = toNum(row.quantidade_un);
  row.preco_medio_pond = toNum(row.preco_medio_pond);
  if (!row.produto || !row.designacao) return null;
  return row as RawRow;
};

// CSV / TXT
const parseDelimited = (text: string): RawRow[] => {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const split = (l: string) =>
    l.split(sep).map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"').trim());
  const head = split(lines[0]);
  const rows: RawRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = split(lines[i]);
    const obj: Record<string, any> = {};
    head.forEach((h, idx) => (obj[h] = cells[idx] ?? ""));
    const r = toRow(obj);
    if (r) rows.push(r);
  }
  return rows;
};

// Excel
const parseExcel = (buf: ArrayBuffer): RawRow[] => {
  const wb = XLSX.read(buf, { type: "array" });
  const out: RawRow[] = [];
  for (const name of wb.SheetNames) {
    const json = XLSX.utils.sheet_to_json<Record<string, any>>(wb.Sheets[name], { defval: "" });
    for (const o of json) {
      const r = toRow(o);
      if (r) out.push(r);
    }
  }
  return out;
};

// Word
const parseDocx = async (buf: ArrayBuffer): Promise<RawRow[]> => {
  const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
  return parseTextTable(value);
};

// PDF
const parsePdf = async (buf: ArrayBuffer): Promise<RawRow[]> => {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // disable worker for simplicity
  pdfjs.GlobalWorkerOptions.workerSrc = "";
  const pdf = await pdfjs.getDocument({ data: buf, useWorker: false, isEvalSupported: false }).promise;
  let text = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Group items by y coordinate to reconstruct lines
    const lines = new Map<number, { x: number; s: string }[]>();
    for (const it of content.items as any[]) {
      const y = Math.round(it.transform[5]);
      const x = it.transform[4];
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y)!.push({ x, s: it.str });
    }
    const ys = [...lines.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const line = lines.get(y)!.sort((a, b) => a.x - b.x).map((p) => p.s).join("\t");
      text += line + "\n";
    }
    text += "\n";
  }
  return parseTextTable(text);
};

// Heuristic text/table parser for Word/PDF/TXT plain text
const parseTextTable = (text: string): RawRow[] => {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s{2,}/g, "\t").trim()).filter(Boolean);
  if (!lines.length) return [];

  // Try to find a header line
  let headerIdx = -1;
  let header: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 30); i++) {
    const parts = lines[i].split(/\t|;|,/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const mapped = parts.filter((p) => ALIASES[norm(p)]);
    if (mapped.length >= 3) {
      header = parts;
      headerIdx = i;
      break;
    }
  }

  // If we found a header, parse subsequent lines using same column count
  if (headerIdx >= 0) {
    const rows: RawRow[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = lines[i].split(/\t|;/).map((c) => c.trim());
      if (cells.length < 2) continue;
      const obj: Record<string, any> = {};
      header.forEach((h, idx) => (obj[h] = cells[idx] ?? ""));
      const r = toRow(obj);
      if (r) rows.push(r);
    }
    if (rows.length) return rows;
  }

  // Fallback: try CSV/TSV parse on the whole text
  return parseDelimited(text);
};

export const parseItensFile = async (file: File): Promise<RawRow[]> => {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv") || name.endsWith(".txt") || name.endsWith(".tsv")) {
    return parseDelimited(await file.text());
  }
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseExcel(await file.arrayBuffer());
  }
  if (name.endsWith(".docx")) {
    return parseDocx(await file.arrayBuffer());
  }
  if (name.endsWith(".pdf")) {
    return parsePdf(await file.arrayBuffer());
  }
  throw new Error("Formato não suportado. Use CSV, TXT, XLSX, DOCX ou PDF.");
};

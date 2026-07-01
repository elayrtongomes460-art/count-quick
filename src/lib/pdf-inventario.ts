import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { brl, dateBR, dateOnly, num } from "./format";
import logoUrl from "@/assets/phoenix-logo.png";

export type InvForPdf = {
  id: string;
  nome_inventario: string;
  data: string;
  responsavel: string;
  observacao?: string | null;
  status: string;
  finalized_at?: string | null;
};

export type InvItemForPdf = {
  produto: string;
  part_number: string | null;
  designacao: string | null;
  quantidade_un_sistema: number;
  quantidade_contada: number;
  diferenca: number;
  unidade_un: string | null;
  localizacao: string | null;
  preco_medio_pond: number;
  valor_divergencia: number;
};

// ============= Paleta corporativa (modelo Phoenix Global) =============
const AZUL: [number, number, number] = [15, 39, 75];       // #0F274B
const AZUL_LINK: [number, number, number] = [37, 99, 235]; // #2563EB
const VERDE: [number, number, number] = [22, 163, 74];      // #16A34A
const VERDE_CLARO: [number, number, number] = [220, 252, 231];
const LARANJA: [number, number, number] = [245, 158, 11];   // #F59E0B
const LARANJA_CLARO: [number, number, number] = [255, 237, 213];
const VERMELHO: [number, number, number] = [220, 38, 38];   // #DC2626
const VERMELHO_CLARO: [number, number, number] = [254, 226, 226];
const AZUL_CLARO_BG: [number, number, number] = [219, 234, 254];
const AZUL_ESCURO_BG: [number, number, number] = [30, 58, 138];
const CINZA_TXT: [number, number, number] = [55, 65, 81];
const CINZA_LABEL: [number, number, number] = [107, 114, 128];
const CINZA_LINHA: [number, number, number] = [226, 232, 240];
const CINZA_FUNDO: [number, number, number] = [248, 250, 252];
const BRANCO: [number, number, number] = [255, 255, 255];

const APP_NAME = "SISTEMA DE INVENTÁRIO";
const APP_VERSION = "Versão 2.1.0";
const COMPANY_NAME = "PHOENIX GLOBAL";

const setFill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
const setText = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

function roundedBox(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill?: [number, number, number], stroke?: [number, number, number]) {
  if (fill) setFill(doc, fill);
  if (stroke) setDraw(doc, stroke);
  const style = fill && stroke ? "FD" : fill ? "F" : "S";
  doc.roundedRect(x, y, w, h, r, r, style);
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(r.error);
      r.onload = () => resolve(String(r.result || ""));
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ---------- Desenhos vetoriais (ícones simples) ----------
function iconClipboard(doc: jsPDF, x: number, y: number, s: number, color: [number, number, number]) {
  setFill(doc, color);
  doc.roundedRect(x + s * 0.15, y + s * 0.15, s * 0.7, s * 0.75, 0.6, 0.6, "F");
  setFill(doc, BRANCO);
  doc.roundedRect(x + s * 0.3, y + s * 0.05, s * 0.4, s * 0.2, 0.4, 0.4, "F");
  setFill(doc, color);
  doc.roundedRect(x + s * 0.35, y + s * 0.08, s * 0.3, s * 0.14, 0.3, 0.3, "F");
}
function iconUser(doc: jsPDF, x: number, y: number, s: number, color: [number, number, number]) {
  setFill(doc, color);
  doc.circle(x + s / 2, y + s * 0.35, s * 0.18, "F");
  doc.roundedRect(x + s * 0.2, y + s * 0.55, s * 0.6, s * 0.4, 1, 1, "F");
}
function iconCalendar(doc: jsPDF, x: number, y: number, s: number, color: [number, number, number]) {
  setFill(doc, color);
  doc.roundedRect(x + s * 0.1, y + s * 0.15, s * 0.8, s * 0.75, 0.6, 0.6, "F");
  setFill(doc, BRANCO);
  doc.rect(x + s * 0.15, y + s * 0.35, s * 0.7, s * 0.5, "F");
  setFill(doc, color);
  doc.rect(x + s * 0.25, y + s * 0.05, s * 0.08, s * 0.18, "F");
  doc.rect(x + s * 0.67, y + s * 0.05, s * 0.08, s * 0.18, "F");
}
function iconCheckCircle(doc: jsPDF, cx: number, cy: number, r: number, color: [number, number, number]) {
  setFill(doc, color);
  doc.circle(cx, cy, r, "F");
  setDraw(doc, BRANCO);
  doc.setLineWidth(0.6);
  doc.line(cx - r * 0.4, cy, cx - r * 0.1, cy + r * 0.35);
  doc.line(cx - r * 0.1, cy + r * 0.35, cx + r * 0.45, cy - r * 0.35);
  doc.setLineWidth(0.2);
}
function iconBox(doc: jsPDF, x: number, y: number, s: number, color: [number, number, number]) {
  setFill(doc, color);
  const p: [number, number][] = [
    [x + s / 2, y + s * 0.1],
    [x + s * 0.92, y + s * 0.3],
    [x + s * 0.92, y + s * 0.75],
    [x + s / 2, y + s * 0.95],
    [x + s * 0.08, y + s * 0.75],
    [x + s * 0.08, y + s * 0.3],
  ];
  const rel = p.slice(1).map((pt, i) => [pt[0] - p[i][0], pt[1] - p[i][1]] as [number, number]);
  doc.lines(rel, p[0][0], p[0][1], [1, 1], "F", true);
}
function iconPlusCircle(doc: jsPDF, cx: number, cy: number, r: number, color: [number, number, number]) {
  setFill(doc, color);
  doc.circle(cx, cy, r, "F");
  setDraw(doc, BRANCO); doc.setLineWidth(0.9);
  doc.line(cx - r * 0.5, cy, cx + r * 0.5, cy);
  doc.line(cx, cy - r * 0.5, cx, cy + r * 0.5);
  doc.setLineWidth(0.2);
}
function iconMinusCircle(doc: jsPDF, cx: number, cy: number, r: number, color: [number, number, number]) {
  setFill(doc, color);
  doc.circle(cx, cy, r, "F");
  setDraw(doc, BRANCO); doc.setLineWidth(0.9);
  doc.line(cx - r * 0.5, cy, cx + r * 0.5, cy);
  doc.setLineWidth(0.2);
}
function iconTag(doc: jsPDF, x: number, y: number, s: number, color: [number, number, number]) {
  setFill(doc, color);
  const p: [number, number][] = [
    [x + s * 0.1, y + s * 0.1], [x + s * 0.55, y + s * 0.1],
    [x + s * 0.95, y + s * 0.5], [x + s * 0.55, y + s * 0.9],
    [x + s * 0.1, y + s * 0.9],
  ];
  const rel = p.slice(1).map((pt, i) => [pt[0] - p[i][0], pt[1] - p[i][1]] as [number, number]);
  doc.lines(rel, p[0][0], p[0][1], [1, 1], "F", true);
  setFill(doc, BRANCO);
  doc.circle(x + s * 0.28, y + s * 0.32, s * 0.08, "F");
}
function iconTrendUp(doc: jsPDF, x: number, y: number, s: number, color: [number, number, number]) {
  setDraw(doc, color); doc.setLineWidth(0.8);
  doc.line(x + s * 0.1, y + s * 0.8, x + s * 0.4, y + s * 0.5);
  doc.line(x + s * 0.4, y + s * 0.5, x + s * 0.6, y + s * 0.65);
  doc.line(x + s * 0.6, y + s * 0.65, x + s * 0.9, y + s * 0.2);
  setFill(doc, color);
  doc.triangle(x + s * 0.9, y + s * 0.2, x + s * 0.75, y + s * 0.2, x + s * 0.9, y + s * 0.35, "F");
  doc.setLineWidth(0.2);
}
function iconClock(doc: jsPDF, cx: number, cy: number, r: number, color: [number, number, number]) {
  setDraw(doc, color); doc.setLineWidth(0.6);
  doc.circle(cx, cy, r, "S");
  doc.line(cx, cy, cx, cy - r * 0.6);
  doc.line(cx, cy, cx + r * 0.45, cy);
  doc.setLineWidth(0.2);
}
function iconEdit(doc: jsPDF, x: number, y: number, s: number, color: [number, number, number]) {
  setDraw(doc, color); doc.setLineWidth(0.6);
  doc.line(x + s * 0.15, y + s * 0.85, x + s * 0.75, y + s * 0.25);
  doc.line(x + s * 0.75, y + s * 0.25, x + s * 0.9, y + s * 0.4);
  doc.line(x + s * 0.9, y + s * 0.4, x + s * 0.3, y + s * 1.0);
  doc.setLineWidth(0.2);
}

// =====================================================================
export async function gerarPdfInventario(inv: InvForPdf, itens: InvItemForPdf[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, PH = 297;
  const M = 8;

  const logoData = await loadLogo();

  // Métricas
  const totalItens = itens.length;
  const comDif = itens.filter(i => Number(i.diferenca) !== 0).length;
  const semDif = totalItens - comDif;
  const nSobra = itens.filter(i => Number(i.diferenca) > 0).length;
  const nFalta = itens.filter(i => Number(i.diferenca) < 0).length;
  const conferidos = totalItens;
  const pctConf = totalItens > 0 ? (conferidos / totalItens) * 100 : 0;
  const pctSobra = totalItens > 0 ? (nSobra / totalItens) * 100 : 0;
  const pctFalta = totalItens > 0 ? (nFalta / totalItens) * 100 : 0;
  const precisao = totalItens > 0 ? (semDif / totalItens) * 100 : 100;
  const pctDiv = totalItens > 0 ? (comDif / totalItens) * 100 : 0;

  const qSist = itens.reduce((s, i) => s + Number(i.quantidade_un_sistema), 0);
  const qCont = itens.reduce((s, i) => s + Number(i.quantidade_contada), 0);
  const difTotal = itens.reduce((s, i) => s + Number(i.diferenca), 0);
  const valorSistema = itens.reduce((s, i) => s + Number(i.quantidade_un_sistema) * Number(i.preco_medio_pond), 0);
  const valorContado = itens.reduce((s, i) => s + Number(i.quantidade_contada) * Number(i.preco_medio_pond), 0);
  const totalDiv = itens.reduce((s, i) => s + Number(i.valor_divergencia), 0);

  const nowIso = new Date().toISOString();
  const nowStr = dateBR(nowIso);
  const [nowData, nowHora] = nowStr.split(" ");

  // Tempo estimado (finalized - created; usamos data como referência se necessário)
  let tempoMin = 0;
  if (inv.finalized_at) {
    const start = new Date(inv.data).getTime();
    const end = new Date(inv.finalized_at).getTime();
    tempoMin = Math.max(0, Math.round((end - start) / 60000));
  }

  // ============================================================
  // CABEÇALHO
  // ============================================================
  const headerH = 22;
  // Logo à esquerda
  if (logoData) {
    try { doc.addImage(logoData, "PNG", M, 4, 34, 14); } catch { /* ignore */ }
  } else {
    setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text(COMPANY_NAME, M, 12);
  }

  // Título central
  setText(doc, AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("RELATÓRIO DE INVENTÁRIO", PW / 2, 13, { align: "center" });

  // Emitido em (direita)
  iconCalendar(doc, PW - M - 26, 5, 6, AZUL);
  setText(doc, CINZA_LABEL);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("Emitido em", PW - M - 18, 9);
  setText(doc, AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(`${nowData} ${nowHora ?? ""}`, PW - M - 18, 13.5);

  // Linha azul
  setDraw(doc, AZUL);
  doc.setLineWidth(0.6);
  doc.line(M, headerH, PW - M, headerH);
  doc.setLineWidth(0.2);

  let y = headerH + 4;

  // ============================================================
  // INFO INVENTÁRIO — Faixa branca com 4 blocos
  // ============================================================
  const infoH = 22;
  roundedBox(doc, M, y, PW - M * 2, infoH, 2, BRANCO, CINZA_LINHA);
  const bW = (PW - M * 2) / 4;
  const inventarioCodigo = String(inv.id).slice(0, 8).toUpperCase();
  const local = itens[0]?.localizacao || inventarioCodigo;

  const drawInfoBlock = (idx: number, icon: () => void, label1: string, val1: string, label2: string, val2: string) => {
    const bx = M + idx * bW + 4;
    icon();
    const tx = bx + 10;
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(label1, tx, y + 6);
    setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(doc.splitTextToSize(val1, bW - 14)[0], tx, y + 10.5);
    if (label2) {
      setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      doc.text(label2, tx, y + 15);
      setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
      doc.text(doc.splitTextToSize(val2, bW - 14)[0], tx, y + 19);
    }
    if (idx < 3) {
      setDraw(doc, CINZA_LINHA);
      doc.line(M + (idx + 1) * bW, y + 3, M + (idx + 1) * bW, y + infoH - 3);
    }
  };

  drawInfoBlock(0,
    () => iconClipboard(doc, M + 4, y + 5, 7, AZUL),
    "Inventário:", inv.nome_inventario,
    "Local:", local);
  drawInfoBlock(1,
    () => iconUser(doc, M + bW + 4, y + 5, 7, AZUL),
    "Responsável:", inv.responsavel,
    "", "");
  // segunda linha do bloco 2 = email do responsável (se profiles disponível — usamos responsavel se contém @)
  {
    const bx = M + bW + 14;
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    const email = inv.responsavel.includes("@") ? inv.responsavel : "";
    if (email) doc.text(doc.splitTextToSize(email, bW - 14)[0], bx, y + 15);
  }
  drawInfoBlock(2,
    () => iconCalendar(doc, M + bW * 2 + 4, y + 5, 7, AZUL),
    "Data do inventário:", dateOnly(inv.data),
    "Finalizado:", inv.finalized_at ? dateBR(inv.finalized_at) : "—");
  {
    const bx = M + bW * 3 + 4;
    iconCheckCircle(doc, bx + 3.5, y + 8, 3.5, inv.status === "Finalizado" ? VERDE : LARANJA);
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text("Status:", bx + 10, y + 6);
    setText(doc, inv.status === "Finalizado" ? VERDE : LARANJA);
    doc.setFont("helvetica", "bold"); doc.setFontSize(11);
    doc.text(inv.status, bx + 10, y + 11.5);
  }
  y += infoH + 4;

  // ============================================================
  // 5 CARDS DE INDICADORES
  // ============================================================
  const cardH = 26;
  const gap = 2;
  const cardW = (PW - M * 2 - gap * 4) / 5;

  type Card = {
    icon: (cx: number, cy: number) => void;
    bg: [number, number, number]; borderCol: [number, number, number];
    label: string; value: string; sub: string; valueColor: [number, number, number];
  };
  const cards: Card[] = [
    {
      icon: (cx, cy) => iconBox(doc, cx - 4, cy - 4, 8, AZUL_LINK),
      bg: AZUL_CLARO_BG, borderCol: AZUL_LINK,
      label: "Total de Itens", value: String(totalItens), sub: "cadastrados", valueColor: AZUL,
    },
    {
      icon: (cx, cy) => iconCheckCircle(doc, cx, cy, 4, VERDE),
      bg: VERDE_CLARO, borderCol: VERDE,
      label: "Itens Conferidos", value: String(conferidos), sub: `${num(pctConf, 0)}% do total`, valueColor: AZUL,
    },
    {
      icon: (cx, cy) => iconPlusCircle(doc, cx, cy, 4, LARANJA),
      bg: LARANJA_CLARO, borderCol: LARANJA,
      label: "Sobras (+)", value: String(nSobra), sub: `${num(pctSobra, 2)}% do total`, valueColor: AZUL,
    },
    {
      icon: (cx, cy) => iconMinusCircle(doc, cx, cy, 4, VERMELHO),
      bg: VERMELHO_CLARO, borderCol: VERMELHO,
      label: "Faltas (-)", value: String(nFalta), sub: `${num(pctFalta, 2)}% do total`, valueColor: AZUL,
    },
    {
      icon: (cx, cy) => iconTag(doc, cx - 4, cy - 4, 8, AZUL),
      bg: AZUL_CLARO_BG, borderCol: AZUL,
      label: "Valor do Estoque", value: brl(valorSistema), sub: "(Sistema)", valueColor: AZUL,
    },
  ];

  cards.forEach((c, i) => {
    const x = M + i * (cardW + gap);
    roundedBox(doc, x, y, cardW, cardH, 2, BRANCO, CINZA_LINHA);
    // círculo do ícone
    setFill(doc, c.bg);
    doc.circle(x + 5, y + cardH / 2, 3.8, "F");
    c.icon(x + 5, y + cardH / 2);
    // label
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(c.label, x + 11, y + 7);
    // valor
    setText(doc, c.valueColor); doc.setFont("helvetica", "bold");
    doc.setFontSize(c.value.length > 8 ? 10 : 15);
    doc.text(c.value, x + 11, y + 15);
    // sub
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(c.sub, x + 11, y + 21);
  });
  y += cardH + 4;

  // ============================================================
  // GRÁFICOS — 2 blocos maiores (rosca + barras) e 1 lateral (resumo)
  // ============================================================
  const gH = 52;
  const g1W = (PW - M * 2 - 4) * 0.32;
  const g2W = (PW - M * 2 - 4) * 0.38;
  const g3W = (PW - M * 2 - 4) - g1W - g2W;

  // ---- Bloco 1: rosca ----
  const g1x = M;
  roundedBox(doc, g1x, y, g1W, gH, 2, BRANCO, CINZA_LINHA);
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Conferência do Inventário", g1x + 3, y + 5.5);

  const cx = g1x + 15, cy = y + 30, rOut = 12, rIn = 7;
  const partes: { v: number; c: [number, number, number] }[] = [
    { v: semDif, c: VERDE },
    { v: nSobra, c: LARANJA },
    { v: nFalta, c: VERMELHO },
  ];
  const tRos = Math.max(1, partes.reduce((s, p) => s + p.v, 0));
  let angStart = -Math.PI / 2;
  partes.forEach(p => {
    if (p.v <= 0) return;
    const ang = (p.v / tRos) * Math.PI * 2;
    setFill(doc, p.c);
    const steps = Math.max(8, Math.ceil((ang / (Math.PI * 2)) * 60));
    const pts: [number, number][] = [[cx, cy]];
    for (let i = 0; i <= steps; i++) {
      const a = angStart + (ang * i) / steps;
      pts.push([cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut]);
    }
    const rel = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]] as [number, number]);
    doc.lines(rel, pts[0][0], pts[0][1], [1, 1], "F", true);
    angStart += ang;
  });
  // furo
  setFill(doc, BRANCO); doc.circle(cx, cy, rIn, "F");
  // % central
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(`${num(precisao, 0)}%`, cx, cy + 1.2, { align: "center", baseline: "middle" });

  // Legenda
  const legX = g1x + 32;
  const legs = [
    { label: `Conferidos (${num(pctConf, 0)}%)`, sub: `${conferidos} itens`, c: VERDE },
    { label: `Sobras (${num(pctSobra, 0)}%)`, sub: `${nSobra} itens`, c: LARANJA },
    { label: `Faltas (${num(pctFalta, 0)}%)`, sub: `${nFalta} itens`, c: VERMELHO },
  ];
  legs.forEach((l, i) => {
    const ly = y + 15 + i * 11;
    setFill(doc, l.c); doc.circle(legX + 1.2, ly - 1.2, 1.2, "F");
    setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5);
    doc.text(l.label, legX + 4, ly);
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(l.sub, legX + 4, ly + 3.5);
  });

  // ---- Bloco 2: barras ----
  const g2x = M + g1W + 2;
  roundedBox(doc, g2x, y, g2W, gH, 2, BRANCO, CINZA_LINHA);
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Comparativo de Quantidades", g2x + 3, y + 5.5);

  // Eixo/desenho
  const chartX0 = g2x + 10, chartY0 = y + 12, chartH = 32, chartW = g2W - 16;
  const maxQ = Math.max(1, qSist, qCont);
  // grid horizontal
  setDraw(doc, CINZA_LINHA); doc.setLineWidth(0.15);
  const ticks = 5;
  for (let i = 0; i <= ticks; i++) {
    const gy = chartY0 + (chartH * i) / ticks;
    doc.line(chartX0, gy, chartX0 + chartW, gy);
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(6.2);
    doc.text(String(Math.round(maxQ - (maxQ * i) / ticks)), chartX0 - 1.5, gy + 1, { align: "right" });
  }
  doc.setLineWidth(0.2);
  // Barras
  const barW = chartW * 0.18;
  const bx1 = chartX0 + chartW * 0.25 - barW / 2;
  const bx2 = chartX0 + chartW * 0.65 - barW / 2;
  const hS = (qSist / maxQ) * chartH;
  const hC = (qCont / maxQ) * chartH;
  setFill(doc, AZUL); doc.rect(bx1, chartY0 + chartH - hS, barW, hS, "F");
  setFill(doc, VERDE); doc.rect(bx2, chartY0 + chartH - hC, barW, hC, "F");
  // valores no topo
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text(num(qSist, 0), bx1 + barW / 2, chartY0 + chartH - hS - 1.2, { align: "center" });
  setText(doc, VERDE);
  doc.text(num(qCont, 0), bx2 + barW / 2, chartY0 + chartH - hC - 1.2, { align: "center" });
  // labels
  setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text("Qtd Sistema", bx1 + barW / 2, chartY0 + chartH + 4, { align: "center" });
  doc.text("Qtd Contada", bx2 + barW / 2, chartY0 + chartH + 4, { align: "center" });

  // ---- Bloco 3: resumo precisão ----
  const g3x = M + g1W + g2W + 4;
  roundedBox(doc, g3x, y, g3W, gH, 2, BRANCO, CINZA_LINHA);
  iconTrendUp(doc, g3x + 2, y + 3, 6, AZUL_LINK);
  setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7.2);
  doc.text("Precisão do Inventário", g3x + 10, y + 6);
  setText(doc, VERDE); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text(`${num(precisao, 2)}%`, g3x + 10, y + 14);

  const r3y0 = y + 20;
  const rows3 = [
    { label: "Itens Conferidos", value: String(conferidos), color: AZUL },
    { label: "Itens com Divergência", value: String(comDif), color: comDif > 0 ? VERMELHO : AZUL },
    { label: "Percentual Divergência", value: `${num(pctDiv, 2)}%`, color: pctDiv > 0 ? VERMELHO : VERDE },
  ];
  rows3.forEach((r, i) => {
    const ry = r3y0 + i * 10;
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text(r.label, g3x + 3, ry);
    setText(doc, r.color); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
    doc.text(r.value, g3x + 3, ry + 5);
  });

  y += gH + 4;

  // ============================================================
  // TABELA PRINCIPAL
  // ============================================================
  autoTable(doc, {
    startY: y,
    head: [[
      "Produto", "Part Number", "Designação", "Loc.", "Un.",
      "Qtd Sistema", "Qtd Contada", "Diferença",
      "Preço Médio", "Valor Sistema", "Valor Contado", "Divergência", "",
    ]],
    body: itens.map(i => {
      const vs = Number(i.quantidade_un_sistema) * Number(i.preco_medio_pond);
      const vc = Number(i.quantidade_contada) * Number(i.preco_medio_pond);
      const d = Number(i.diferenca);
      const status = d === 0 ? "OK" : d > 0 ? "SOBRA" : "FALTA";
      return [
        i.produto, i.part_number || "-", i.designacao || "",
        i.localizacao || "-", i.unidade_un || "-",
        num(i.quantidade_un_sistema, 0), num(i.quantidade_contada, 0),
        (d > 0 ? "+" : "") + num(d, 0),
        brl(i.preco_medio_pond), brl(vs), brl(vc), brl(i.valor_divergencia), status,
      ];
    }),
    foot: [[
      "TOTAL", "", "", "", "",
      num(qSist, 0), num(qCont, 0), (difTotal > 0 ? "+" : "") + num(difTotal, 0),
      "", brl(valorSistema), brl(valorContado), brl(totalDiv), "",
    ]],
    theme: "plain",
    headStyles: {
      fillColor: CINZA_FUNDO, textColor: AZUL, fontSize: 7.2, fontStyle: "bold",
      halign: "left", valign: "middle", cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 },
      lineColor: CINZA_LINHA, lineWidth: 0.15,
    },
    footStyles: {
      fillColor: CINZA_FUNDO, textColor: AZUL, fontStyle: "bold", fontSize: 8,
      cellPadding: 2.4, lineColor: CINZA_LINHA, lineWidth: 0.15,
    },
    bodyStyles: {
      fontSize: 7.2, cellPadding: { top: 2.4, bottom: 2.4, left: 2, right: 2 },
      textColor: CINZA_TXT, valign: "middle",
      lineColor: CINZA_LINHA, lineWidth: 0.1,
    },
    styles: { overflow: "linebreak" },
    columnStyles: {
      0: { fontStyle: "bold", textColor: AZUL, cellWidth: 15 },
      1: { cellWidth: 15 },
      2: { cellWidth: 30 },
      3: { cellWidth: 16, halign: "center" },
      4: { cellWidth: 8, halign: "center" },
      5: { halign: "center", cellWidth: 15 },
      6: { halign: "center", cellWidth: 15 },
      7: { halign: "center", fontStyle: "bold", cellWidth: 14 },
      8: { halign: "right", cellWidth: 17 },
      9: { halign: "right", cellWidth: 20 },
      10: { halign: "right", cellWidth: 20 },
      11: { halign: "right", cellWidth: 17 },
      12: { halign: "center", cellWidth: 12 },
    },
    didParseCell: (data) => {
      // linha do rodapé
      if (data.section === "foot") {
        if (data.column.index === 11) {
          const raw = String(data.cell.raw ?? "");
          if (raw.includes("R$ 0,00")) data.cell.styles.textColor = VERMELHO;
          else data.cell.styles.textColor = VERMELHO;
        }
      }
      if (data.section === "body" && data.column.index === 7) {
        const raw = String(data.cell.raw ?? "0").replace("+", "").replace(/\./g, "").replace(",", ".");
        const n = Number(raw);
        data.cell.styles.textColor = n === 0 ? VERDE : n < 0 ? VERMELHO : LARANJA;
      }
      if (data.section === "body" && data.column.index === 11) {
        const raw = String(data.cell.raw ?? "");
        if (!raw.includes("R$ 0,00")) data.cell.styles.textColor = VERMELHO;
      }
    },
    willDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 12) {
        data.cell.text = [""]; // desenhamos badge manualmente
      }
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 12) {
        const status = String(data.cell.raw ?? "");
        const bx = data.cell.x + data.cell.width / 2;
        const by = data.cell.y + data.cell.height / 2;
        const bw = 10, bh = 5;
        const fill = status === "OK" ? VERDE_CLARO : status === "SOBRA" ? LARANJA_CLARO : VERMELHO_CLARO;
        const border = status === "OK" ? VERDE : status === "SOBRA" ? LARANJA : VERMELHO;
        setFill(doc, fill); setDraw(doc, border);
        doc.roundedRect(bx - bw / 2, by - bh / 2, bw, bh, 0.8, 0.8, "FD");
        setText(doc, border); doc.setFont("helvetica", "bold"); doc.setFontSize(6.2);
        doc.text(status, bx, by + 0.3, { align: "center", baseline: "middle" });
      }
      // Zebra
      if (data.section === "body" && data.row.index % 2 === 1 && data.column.index === 0) {
        // fundo desenhado no willDrawRow via didDrawCell é limitado; alternamos via didParseCell abaixo
      }
    },
    didDrawPage: () => {
      // Rodapé em cada página
      const pw = PW;
      setFill(doc, AZUL); doc.rect(0, PH - 8, pw, 8, "F");
      setText(doc, BRANCO); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      // esquerda
      iconBox(doc, M, PH - 6.5, 4, BRANCO);
      doc.text(APP_NAME, M + 5, PH - 4);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
      doc.text(APP_VERSION, M + 5, PH - 1.5);
      // centro
      doc.setFont("helvetica", "normal"); doc.setFontSize(7);
      const cur = doc.getCurrentPageInfo().pageNumber;
      const tot = doc.getNumberOfPages();
      doc.text(`Página ${cur} de ${tot}`, pw / 2, PH - 3, { align: "center" });
      // direita
      doc.text(`Emitido em ${nowData} às ${nowHora ?? ""}`, pw - M, PH - 3, { align: "right" });
    },
    margin: { left: M, right: M, top: 22, bottom: 12 },
  });

  // ============================================================
  // Após a tabela: 3 cards inferiores
  // ============================================================
  // @ts-expect-error injetado por autotable
  let yAfter = (doc.lastAutoTable?.finalY ?? y) + 6;
  const need = 62;
  if (yAfter + need > PH - 24) { doc.addPage(); yAfter = 22; }

  const bottomW = (PW - M * 2 - 4) / 3;

  // Card 1: Resumo Financeiro
  const c1x = M;
  const cardBoxH = 52;
  roundedBox(doc, c1x, yAfter, bottomW, cardBoxH, 2, BRANCO, CINZA_LINHA);
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Resumo Financeiro", c1x + 4, yAfter + 6);
  setDraw(doc, CINZA_LINHA); doc.line(c1x + 4, yAfter + 8, c1x + bottomW - 4, yAfter + 8);
  const finR = [
    { l: "Valor em estoque (sistema)", v: brl(valorSistema), c: AZUL, bold: false },
    { l: "Valor contado", v: brl(valorContado), c: AZUL, bold: false },
  ];
  finR.forEach((r, i) => {
    const ry = yAfter + 15 + i * 8;
    setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(r.l, c1x + 4, ry);
    setText(doc, r.c); doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    doc.text(r.v, c1x + bottomW - 4, ry, { align: "right" });
  });
  // Divergência em destaque
  setText(doc, VERMELHO); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("Valor total da divergência", c1x + 4, yAfter + 40);
  doc.setFontSize(11);
  doc.text(brl(totalDiv), c1x + bottomW - 4, yAfter + 40, { align: "right" });

  // Card 2: Estatísticas
  const c2x = M + bottomW + 2;
  roundedBox(doc, c2x, yAfter, bottomW, cardBoxH, 2, BRANCO, CINZA_LINHA);
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("Estatísticas do Inventário", c2x + 4, yAfter + 6);
  setDraw(doc, CINZA_LINHA); doc.line(c2x + 4, yAfter + 8, c2x + bottomW - 4, yAfter + 8);
  const clearBoxY = yAfter + 10;
  setFill(doc, BRANCO); doc.rect(c2x + 1, clearBoxY, bottomW - 2, cardBoxH - 11, "F");

  const estList: { icon: (cx: number, cy: number) => void; l: string; v: string }[] = [
    { icon: (cx, cy) => iconCheckCircle(doc, cx, cy, 2, VERDE), l: "Itens conferidos:", v: `${conferidos} (${num(pctConf, 2)}%)` },
    { icon: (cx, cy) => iconCheckCircle(doc, cx, cy, 2, VERDE), l: "Sem divergência:", v: `${semDif} (${num((semDif / Math.max(1, totalItens)) * 100, 2)}%)` },
    { icon: (cx, cy) => iconPlusCircle(doc, cx, cy, 2, LARANJA), l: "Com divergência:", v: `${comDif} (${num(pctDiv, 2)}%)` },
    { icon: (cx, cy) => iconClock(doc, cx, cy, 2, AZUL_LINK), l: "Tempo de inventário:", v: `${tempoMin} minutos` },
    { icon: (cx, cy) => iconUser(doc, cx - 2, cy - 2, 4, AZUL), l: "Operador:", v: inv.responsavel },
  ];
  estList.forEach((r, i) => {
    const ry = yAfter + 15 + i * 7.5;
    r.icon(c2x + 6, ry - 1);
    setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7.4);
    doc.text(r.l, c2x + 11, ry);
    setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(7.6);
    doc.text(doc.splitTextToSize(r.v, bottomW - 44)[0], c2x + bottomW - 4, ry, { align: "right" });
  });

  // Card 3: QR + info
  const c3x = M + (bottomW + 2) * 2;
  roundedBox(doc, c3x, yAfter, bottomW, cardBoxH, 2, BRANCO, CINZA_LINHA);
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(9);
  doc.text("QR Code – Detalhes do Inventário", c3x + 4, yAfter + 6);
  setDraw(doc, CINZA_LINHA); doc.line(c3x + 4, yAfter + 8, c3x + bottomW - 4, yAfter + 8);

  const qrPayload = JSON.stringify({
    id: inv.id, data: inv.data, resp: inv.responsavel, status: inv.status,
  });
  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 240 });
    doc.addImage(qrDataUrl, "PNG", c3x + 4, yAfter + 12, 26, 26);
  } catch { /* ignore */ }

  setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
  doc.text(
    doc.splitTextToSize("Escaneie para abrir os detalhes deste inventário no sistema.", bottomW - 34),
    c3x + 32, yAfter + 15
  );

  const qrLines = [
    ["Inventário:", inv.nome_inventario],
    ["Data:", dateOnly(inv.data)],
    ["Responsável:", inv.responsavel],
    ["Status:", inv.status],
  ];
  qrLines.forEach((r, i) => {
    const ry = yAfter + 28 + i * 5;
    setText(doc, CINZA_LABEL); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(r[0], c3x + 32, ry);
    setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(6.8);
    const maxW = bottomW - 50;
    doc.text(doc.splitTextToSize(r[1], maxW)[0], c3x + 48, ry);
  });

  yAfter += cardBoxH + 5;

  // ============================================================
  // ASSINATURAS
  // ============================================================
  if (yAfter + 24 > PH - 12) { doc.addPage(); yAfter = 22; }
  const sigW = (PW - M * 2 - 8) / 3;
  const sigs = [
    { icon: () => iconEdit, label: "Responsável pelo Inventário", subline: inv.responsavel },
    { icon: () => iconEdit, label: "Supervisor / Conferente", subline: "" },
    { icon: () => iconCalendar, label: "Data", subline: "___/___/______" },
  ];
  sigs.forEach((s, i) => {
    const sx = M + i * (sigW + 4);
    // ícone
    if (i === 2) iconCalendar(doc, sx + sigW / 2 - 3, yAfter, 6, AZUL);
    else iconEdit(doc, sx + sigW / 2 - 3, yAfter, 6, AZUL);
    // linha
    setDraw(doc, [80, 80, 90]); doc.setLineWidth(0.4);
    doc.line(sx + 4, yAfter + 10, sx + sigW - 4, yAfter + 10);
    doc.setLineWidth(0.2);
    // label
    setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text(s.label, sx + sigW / 2, yAfter + 15, { align: "center" });
    if (s.subline) {
      setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
      doc.text(s.subline, sx + sigW / 2, yAfter + 20, { align: "center" });
    }
  });
  void AZUL_ESCURO_BG;

  doc.save(`Inventario_${inv.nome_inventario.replace(/\s+/g, "_")}.pdf`);
}

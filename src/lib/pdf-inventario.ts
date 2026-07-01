import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
import { brl, dateBR, dateOnly, num } from "./format";

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

// ----- Paleta -----
const AZUL: [number, number, number] = [15, 39, 75];      // #0F274B
const AZUL_CLARO: [number, number, number] = [37, 99, 235];
const VERDE: [number, number, number] = [22, 163, 74];     // #16A34A
const LARANJA: [number, number, number] = [245, 158, 11];  // #F59E0B
const VERMELHO: [number, number, number] = [220, 38, 38];  // #DC2626
const CINZA_TXT: [number, number, number] = [55, 65, 81];
const CINZA_LINHA: [number, number, number] = [226, 232, 240];
const CINZA_FUNDO: [number, number, number] = [248, 250, 252];

const APP_NAME = "Sistema de Inventário";
const APP_VERSION = "v2.0";
const COMPANY_NAME = "Sua Empresa";

function setFill(doc: jsPDF, c: [number, number, number]) { doc.setFillColor(c[0], c[1], c[2]); }
function setDraw(doc: jsPDF, c: [number, number, number]) { doc.setDrawColor(c[0], c[1], c[2]); }
function setText(doc: jsPDF, c: [number, number, number]) { doc.setTextColor(c[0], c[1], c[2]); }

// Retângulo arredondado com fill
function roundedBox(doc: jsPDF, x: number, y: number, w: number, h: number, r: number, fill: [number, number, number], stroke?: [number, number, number]) {
  setFill(doc, fill);
  if (stroke) { setDraw(doc, stroke); doc.roundedRect(x, y, w, h, r, r, "FD"); }
  else doc.roundedRect(x, y, w, h, r, r, "F");
}

export async function gerarPdfInventario(inv: InvForPdf, itens: InvItemForPdf[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const PW = 210, PH = 297;
  const M = 10;

  // ----- Métricas -----
  const totalItens = itens.length;
  const comDif = itens.filter(i => Number(i.diferenca) !== 0).length;
  const semDif = totalItens - comDif;
  const sobra = itens.filter(i => Number(i.diferenca) > 0).reduce((s, i) => s + Number(i.diferenca), 0);
  const falta = itens.filter(i => Number(i.diferenca) < 0).reduce((s, i) => s + Number(i.diferenca), 0);
  const conferidos = totalItens;
  const totalCadastrado = totalItens;
  const valorSistema = itens.reduce((s, i) => s + Number(i.quantidade_un_sistema) * Number(i.preco_medio_pond), 0);
  const valorContado = itens.reduce((s, i) => s + Number(i.quantidade_contada) * Number(i.preco_medio_pond), 0);
  const totalDiv = itens.reduce((s, i) => s + Number(i.valor_divergencia), 0);
  const pctConferido = totalCadastrado > 0 ? (conferidos / totalCadastrado) * 100 : 0;
  const pctDiv = totalItens > 0 ? (comDif / totalItens) * 100 : 0;
  const pctSobra = totalItens > 0 ? (itens.filter(i => Number(i.diferenca) > 0).length / totalItens) * 100 : 0;
  const pctFalta = totalItens > 0 ? (itens.filter(i => Number(i.diferenca) < 0).length / totalItens) * 100 : 0;
  const precisao = totalItens > 0 ? (semDif / totalItens) * 100 : 100;

  const nowIso = new Date().toISOString();

  // ================= CABEÇALHO =================
  setFill(doc, AZUL);
  doc.rect(0, 0, PW, 26, "F");
  // Logo box (placeholder com iniciais)
  roundedBox(doc, M, 6, 14, 14, 2, [255, 255, 255]);
  setText(doc, AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const initials = COMPANY_NAME.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase();
  doc.text(initials, M + 7, 15, { align: "center", baseline: "middle" });
  // Empresa
  setText(doc, [255, 255, 255]);
  doc.setFontSize(11);
  doc.text(COMPANY_NAME, M + 18, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 220, 255);
  doc.text("Gestão de Estoque e Inventário", M + 18, 17);

  // Título centro
  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("RELATÓRIO DE INVENTÁRIO", PW / 2, 13, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(200, 220, 255);
  doc.text("Documento oficial de controle patrimonial", PW / 2, 18, { align: "center" });

  // Direita: emitido em
  const nowStr = dateBR(nowIso);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(200, 220, 255);
  doc.text("EMITIDO EM", PW - M, 11, { align: "right" });
  setText(doc, [255, 255, 255]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(nowStr, PW - M, 16, { align: "right" });

  // Linha azul clara abaixo
  setFill(doc, AZUL_CLARO);
  doc.rect(0, 26, PW, 1, "F");

  let y = 32;

  // ================= INFO DO INVENTÁRIO (4 blocos) =================
  const blocoH = 22;
  const blocoW = (PW - M * 2 - 6) / 4;
  const blocos = [
    { label: "INVENTÁRIO", l1: inv.nome_inventario, l2: `ID: ${String(inv.id).slice(0, 8).toUpperCase()}`, cor: AZUL_CLARO },
    { label: "RESPONSÁVEL", l1: inv.responsavel, l2: "", cor: [147, 51, 234] as [number, number, number] },
    { label: "DATA DO INVENTÁRIO", l1: dateOnly(inv.data), l2: inv.finalized_at ? `Fim: ${dateBR(inv.finalized_at)}` : "Em andamento", cor: LARANJA },
    { label: "STATUS", l1: inv.status, l2: inv.status === "Finalizado" ? "Concluído" : "—", cor: inv.status === "Finalizado" ? VERDE : LARANJA },
  ];
  blocos.forEach((b, i) => {
    const x = M + i * (blocoW + 2);
    roundedBox(doc, x, y, blocoW, blocoH, 2, [255, 255, 255], CINZA_LINHA);
    // faixa colorida à esquerda
    setFill(doc, b.cor);
    doc.roundedRect(x, y, 2, blocoH, 1, 1, "F");
    setText(doc, [120, 120, 130]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.text(b.label, x + 4, y + 4.5);
    setText(doc, AZUL);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const t = doc.splitTextToSize(b.l1 || "—", blocoW - 6)[0];
    doc.text(t, x + 4, y + 10);
    if (b.l2) {
      setText(doc, CINZA_TXT);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const t2 = doc.splitTextToSize(b.l2, blocoW - 6)[0];
      doc.text(t2, x + 4, y + 15);
    }
  });
  y += blocoH + 5;

  // ================= 5 CARDS DE INDICADORES =================
  const cardW = (PW - M * 2 - 8) / 5;
  const cardH = 22;
  const cards = [
    { label: "TOTAL DE ITENS", value: String(totalItens), sub: "cadastrados", cor: AZUL_CLARO },
    { label: "CONFERIDOS", value: String(conferidos), sub: `${num(pctConferido, 1)}%`, cor: VERDE },
    { label: "SOBRAS (+)", value: num(sobra, 0), sub: `${num(pctSobra, 1)}%`, cor: LARANJA },
    { label: "FALTAS (−)", value: num(Math.abs(falta), 0), sub: `${num(pctFalta, 1)}%`, cor: VERMELHO },
    { label: "VALOR ESTOQUE", value: brl(valorSistema), sub: "sistema", cor: AZUL },
  ];
  cards.forEach((c, i) => {
    const x = M + i * (cardW + 2);
    roundedBox(doc, x, y, cardW, cardH, 2, [255, 255, 255], CINZA_LINHA);
    // ponto colorido
    setFill(doc, c.cor);
    doc.circle(x + 4, y + 4.5, 1.2, "F");
    setText(doc, [120, 120, 130]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.2);
    doc.text(c.label, x + 7, y + 5);
    setText(doc, AZUL);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(c.value.length > 10 ? 10 : 14);
    doc.text(c.value, x + 3, y + 14);
    setText(doc, c.cor);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.text(c.sub, x + 3, y + 19);
  });
  y += cardH + 5;

  // ================= GRÁFICOS (3 blocos) =================
  const gH = 42;
  const gW = (PW - M * 2 - 4) / 3;

  // --- Bloco 1: rosca ---
  const g1x = M;
  roundedBox(doc, g1x, y, gW, gH, 2, [255, 255, 255], CINZA_LINHA);
  setText(doc, AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Distribuição", g1x + 3, y + 5);
  // desenha rosca simples
  const cx = g1x + 12, cy = y + 24, rOut = 10, rIn = 5.5;
  const totalRosca = Math.max(1, semDif + Math.abs(sobra ? 1 : 0) + Math.abs(falta ? 1 : 0));
  const partesRosca: { v: number; c: [number, number, number] }[] = [
    { v: semDif, c: VERDE },
    { v: itens.filter(i => Number(i.diferenca) > 0).length, c: LARANJA },
    { v: itens.filter(i => Number(i.diferenca) < 0).length, c: VERMELHO },
  ];
  const tRos = Math.max(1, partesRosca.reduce((s, p) => s + p.v, 0));
  let angStart = -Math.PI / 2;
  partesRosca.forEach(p => {
    if (p.v <= 0) return;
    const ang = (p.v / tRos) * Math.PI * 2;
    const angEnd = angStart + ang;
    // aproxima setor com polígono (36 lados)
    setFill(doc, p.c);
    const steps = Math.max(6, Math.ceil((ang / (Math.PI * 2)) * 48));
    const pts: [number, number][] = [];
    pts.push([cx, cy]);
    for (let i = 0; i <= steps; i++) {
      const a = angStart + (ang * i) / steps;
      pts.push([cx + Math.cos(a) * rOut, cy + Math.sin(a) * rOut]);
    }
    // usa lines para pintar polígono
    const relLines = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]] as [number, number]);
    doc.lines(relLines, pts[0][0], pts[0][1], [1, 1], "F", true);
    angStart = angEnd;
  });
  // furo do meio
  setFill(doc, [255, 255, 255]);
  doc.circle(cx, cy, rIn, "F");
  // legenda
  const legX = g1x + 27;
  let legY = y + 12;
  const legendas = [
    { label: `OK ${num(precisao, 1)}%`, c: VERDE },
    { label: `Sobra ${num(pctSobra, 1)}%`, c: LARANJA },
    { label: `Falta ${num(pctFalta, 1)}%`, c: VERMELHO },
  ];
  legendas.forEach(l => {
    setFill(doc, l.c); doc.rect(legX, legY - 2.4, 2.5, 2.5, "F");
    setText(doc, CINZA_TXT);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(l.label, legX + 4, legY);
    legY += 5;
  });
  void tRos; void totalRosca;

  // --- Bloco 2: barras (sistema vs contado) ---
  const g2x = M + gW + 2;
  roundedBox(doc, g2x, y, gW, gH, 2, [255, 255, 255], CINZA_LINHA);
  setText(doc, AZUL);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Sistema × Contado", g2x + 3, y + 5);
  const qSist = itens.reduce((s, i) => s + Number(i.quantidade_un_sistema), 0);
  const qCont = itens.reduce((s, i) => s + Number(i.quantidade_contada), 0);
  const maxQ = Math.max(1, qSist, qCont);
  const barMaxH = 22;
  const bX = g2x + 12;
  const bY = y + 34;
  const bW = 12;
  const hS = (qSist / maxQ) * barMaxH;
  const hC = (qCont / maxQ) * barMaxH;
  setFill(doc, AZUL_CLARO); doc.rect(bX, bY - hS, bW, hS, "F");
  setFill(doc, VERDE); doc.rect(bX + 22, bY - hC, bW, hC, "F");
  // labels
  setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
  doc.text("Sistema", bX + bW / 2, bY + 3, { align: "center" });
  doc.text("Contado", bX + 22 + bW / 2, bY + 3, { align: "center" });
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.text(num(qSist, 0), bX + bW / 2, bY - hS - 1, { align: "center" });
  doc.text(num(qCont, 0), bX + 22 + bW / 2, bY - hC - 1, { align: "center" });

  // --- Bloco 3: resumo texto ---
  const g3x = M + (gW + 2) * 2;
  roundedBox(doc, g3x, y, gW, gH, 2, [255, 255, 255], CINZA_LINHA);
  setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("Precisão do Inventário", g3x + 3, y + 5);
  setText(doc, VERDE); doc.setFontSize(20);
  doc.text(`${num(precisao, 1)}%`, g3x + 3, y + 15);
  setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
  const rez = [
    `Itens conferidos: ${conferidos}`,
    `Sem divergência: ${semDif}`,
    `Com divergência: ${comDif}`,
    `% Divergência: ${num(pctDiv, 1)}%`,
  ];
  rez.forEach((t, i) => doc.text(t, g3x + 3, y + 22 + i * 4.5));

  y += gH + 5;

  // ================= TABELA PRINCIPAL =================
  autoTable(doc, {
    startY: y,
    head: [[
      "Produto", "PN", "Designação", "Local", "Un",
      "Qtd Sist", "Qtd Cont", "Dif",
      "Preço Méd", "Val Sist", "Val Cont", "Divergência", "Status",
    ]],
    body: itens.map(i => {
      const vs = Number(i.quantidade_un_sistema) * Number(i.preco_medio_pond);
      const vc = Number(i.quantidade_contada) * Number(i.preco_medio_pond);
      const d = Number(i.diferenca);
      const status = d === 0 ? "OK" : d > 0 ? "SOBRA" : "FALTA";
      return [
        i.produto, i.part_number ?? "", i.designacao ?? "", i.localizacao ?? "", i.unidade_un ?? "",
        num(i.quantidade_un_sistema, 0), num(i.quantidade_contada, 0),
        (d > 0 ? "+" : "") + num(d, 0),
        brl(i.preco_medio_pond), brl(vs), brl(vc), brl(i.valor_divergencia), status,
      ];
    }),
    foot: [[
      "TOTAL", "", "", "", "",
      num(qSist, 0), num(qCont, 0), num(itens.reduce((s, i) => s + Number(i.diferenca), 0), 0),
      "", brl(valorSistema), brl(valorContado), brl(totalDiv), "",
    ]],
    theme: "grid",
    headStyles: {
      fillColor: AZUL, textColor: 255, fontSize: 7, fontStyle: "bold",
      halign: "center", valign: "middle", cellPadding: 1.6,
    },
    footStyles: {
      fillColor: CINZA_LINHA, textColor: AZUL, fontStyle: "bold", fontSize: 7,
      halign: "right", cellPadding: 1.6,
    },
    bodyStyles: { fontSize: 6.8, cellPadding: 1.4, textColor: CINZA_TXT, valign: "middle" },
    alternateRowStyles: { fillColor: CINZA_FUNDO },
    styles: { overflow: "linebreak", lineColor: CINZA_LINHA, lineWidth: 0.1 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: AZUL, cellWidth: 20 },
      1: { cellWidth: 16 },
      2: { cellWidth: 34 },
      3: { cellWidth: 12, halign: "center" },
      4: { cellWidth: 8, halign: "center" },
      5: { halign: "center" }, 6: { halign: "center" }, 7: { halign: "center", fontStyle: "bold" },
      8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" },
      11: { halign: "right" }, 12: { halign: "center", cellWidth: 14 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const raw = String(data.cell.raw ?? "0").replace("+", "").replace(/\./g, "").replace(",", ".");
        const n = Number(raw);
        if (n !== 0) { data.cell.styles.textColor = n < 0 ? VERMELHO : LARANJA; }
      }
      if (data.section === "body" && data.column.index === 11) {
        const raw = String(data.cell.raw ?? "");
        if (raw && !raw.includes("R$ 0,00")) data.cell.styles.textColor = VERMELHO;
      }
    },
    didDrawCell: (data) => {
      // desenha badge de status
      if (data.section === "body" && data.column.index === 12) {
        const status = String(data.cell.raw ?? "");
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        const bw = 12, bh = 4.2;
        const cor = status === "OK" ? VERDE : status === "SOBRA" ? LARANJA : VERMELHO;
        setFill(doc, cor);
        doc.roundedRect(cx - bw / 2, cy - bh / 2, bw, bh, 1, 1, "F");
        setText(doc, [255, 255, 255]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6);
        doc.text(status, cx, cy + 0.3, { align: "center", baseline: "middle" });
      }
    },
    willDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 12) {
        // clear text; drawn manually
        data.cell.text = [""];
      }
    },
    margin: { left: M, right: M, top: 32, bottom: 18 },
    didDrawPage: () => {
      // rodapé
      setFill(doc, AZUL);
      doc.rect(0, PH - 10, PW, 10, "F");
      setText(doc, [255, 255, 255]);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.text(`${APP_NAME} ${APP_VERSION}`, M, PH - 4);
      const cur = doc.getCurrentPageInfo().pageNumber;
      const tot = doc.getNumberOfPages();
      doc.text(`Página ${cur} de ${tot}`, PW / 2, PH - 4, { align: "center" });
      doc.text(`Emitido em ${nowStr}`, PW - M, PH - 4, { align: "right" });
    },
  });

  // ================= RESUMO INFERIOR =================
  // @ts-expect-error injetado por autotable
  let yAfter = (doc.lastAutoTable?.finalY ?? y) + 6;
  const espacoNecessario = 62;
  if (yAfter + espacoNecessario > PH - 12) {
    doc.addPage();
    yAfter = 32;
  }

  const colW = (PW - M * 2 - 6) / 3;

  // Card financeiro
  roundedBox(doc, M, yAfter, colW, 42, 2, [255, 255, 255], CINZA_LINHA);
  setFill(doc, AZUL); doc.rect(M, yAfter, colW, 6, "F");
  setText(doc, [255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("RESUMO FINANCEIRO", M + 3, yAfter + 4.2);
  const finRows = [
    ["Valor Sistema", brl(valorSistema)],
    ["Valor Contado", brl(valorContado)],
    ["Divergência", brl(totalDiv)],
  ];
  finRows.forEach((r, i) => {
    const ry = yAfter + 12 + i * 9;
    setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
    doc.text(r[0], M + 3, ry);
    setText(doc, i === 2 && totalDiv !== 0 ? VERMELHO : AZUL);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9);
    doc.text(r[1], M + colW - 3, ry, { align: "right" });
    if (i < 2) { setDraw(doc, CINZA_LINHA); doc.line(M + 3, ry + 2, M + colW - 3, ry + 2); }
  });

  // Card estatísticas
  const cx2 = M + colW + 3;
  roundedBox(doc, cx2, yAfter, colW, 42, 2, [255, 255, 255], CINZA_LINHA);
  setFill(doc, VERDE); doc.rect(cx2, yAfter, colW, 6, "F");
  setText(doc, [255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("ESTATÍSTICAS", cx2 + 3, yAfter + 4.2);
  const estRows = [
    ["Itens Conferidos", String(conferidos)],
    ["Sem Divergência", String(semDif)],
    ["Com Divergência", String(comDif)],
    ["Operador", inv.responsavel],
  ];
  estRows.forEach((r, i) => {
    const ry = yAfter + 12 + i * 7;
    setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(r[0], cx2 + 3, ry);
    setText(doc, AZUL); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    const t = doc.splitTextToSize(r[1], colW - 30)[0];
    doc.text(t, cx2 + colW - 3, ry, { align: "right" });
  });

  // Card QR + info
  const cx3 = M + (colW + 3) * 2;
  roundedBox(doc, cx3, yAfter, colW, 42, 2, [255, 255, 255], CINZA_LINHA);
  setFill(doc, AZUL_CLARO); doc.rect(cx3, yAfter, colW, 6, "F");
  setText(doc, [255, 255, 255]); doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("VERIFICAÇÃO", cx3 + 3, yAfter + 4.2);

  const qrPayload = JSON.stringify({
    id: inv.id, data: inv.data, resp: inv.responsavel, status: inv.status,
  });
  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 200 });
    doc.addImage(qrDataUrl, "PNG", cx3 + 3, yAfter + 10, 28, 28);
  } catch { /* ignore */ }
  setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
  const infoLines = [
    ["ID", String(inv.id).slice(0, 8).toUpperCase()],
    ["Data", dateOnly(inv.data)],
    ["Resp.", inv.responsavel],
    ["Status", inv.status],
  ];
  infoLines.forEach((r, i) => {
    const ry = yAfter + 13 + i * 6;
    doc.setFont("helvetica", "normal"); setText(doc, [120, 120, 130]);
    doc.text(r[0], cx3 + 34, ry);
    setText(doc, AZUL); doc.setFont("helvetica", "bold");
    doc.text(doc.splitTextToSize(r[1], colW - 40)[0], cx3 + 44, ry);
  });

  yAfter += 46;

  // ================= ASSINATURAS =================
  if (yAfter + 26 > PH - 12) { doc.addPage(); yAfter = 32; }
  const sigW = (PW - M * 2 - 8) / 3;
  const sigs = ["Responsável pelo Inventário", "Supervisor / Conferente", "Data"];
  sigs.forEach((label, i) => {
    const sx = M + i * (sigW + 4);
    setDraw(doc, CINZA_TXT); doc.setLineWidth(0.3);
    doc.line(sx, yAfter + 14, sx + sigW, yAfter + 14);
    setText(doc, CINZA_TXT); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5);
    doc.text(label, sx + sigW / 2, yAfter + 18, { align: "center" });
  });

  doc.save(`Inventario_${inv.nome_inventario.replace(/\s+/g, "_")}.pdf`);
}

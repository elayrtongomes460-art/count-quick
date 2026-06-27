import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
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

export function gerarPdfInventario(inv: InvForPdf, itens: InvItemForPdf[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const totalItens = itens.length;
  const comDif = itens.filter(i => Number(i.diferenca) !== 0).length;
  const sobra = itens.filter(i => Number(i.diferenca) > 0).reduce((s, i) => s + Number(i.diferenca), 0);
  const falta = itens.filter(i => Number(i.diferenca) < 0).reduce((s, i) => s + Number(i.diferenca), 0);
  const valorSistema = itens.reduce((s, i) => s + Number(i.quantidade_un_sistema) * Number(i.preco_medio_pond), 0);
  const valorContado = itens.reduce((s, i) => s + Number(i.quantidade_contada) * Number(i.preco_medio_pond), 0);
  const totalDiv = itens.reduce((s, i) => s + Number(i.valor_divergencia), 0);

  // Cabeçalho
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 297, 22, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("RELATÓRIO DE INVENTÁRIO", 10, 14);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${dateBR(new Date().toISOString())}`, 297 - 10, 14, { align: "right" });

  // Bloco de info
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(11);
  let y = 30;
  doc.setFont("helvetica", "bold");
  doc.text(inv.nome_inventario, 10, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const linha = [
    `Data: ${dateOnly(inv.data)}`,
    `Responsável: ${inv.responsavel}`,
    `Status: ${inv.status}`,
    inv.finalized_at ? `Finalizado: ${dateBR(inv.finalized_at)}` : null,
  ].filter(Boolean).join("   |   ");
  doc.text(linha, 10, y);
  y += 5;
  if (inv.observacao) {
    doc.text(`Observação: ${inv.observacao}`, 10, y);
    y += 5;
  }

  // Resumo
  y += 2;
  const resumo: [string, string][] = [
    ["Total de itens contados", String(totalItens)],
    ["Itens com divergência", String(comDif)],
    ["Sobra (+)", num(sobra, 0)],
    ["Falta (−)", num(falta, 0)],
    ["Valor em estoque (sistema)", brl(valorSistema)],
    ["Valor contado", brl(valorContado)],
    ["Valor total da divergência", brl(totalDiv)],
  ];
  autoTable(doc, {
    startY: y,
    head: [["Resumo", "Valor"]],
    body: resumo,
    theme: "grid",
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 70 }, 1: { halign: "right" } },
    margin: { left: 10, right: 170 },
  });

  // Tabela itens
  // @ts-expect-error lastAutoTable injetado
  const yAfter = (doc.lastAutoTable?.finalY ?? y) + 6;
  autoTable(doc, {
    startY: yAfter,
    head: [[
      "Produto", "Part Number", "Designação", "Loc.", "Un.",
      "Qtd Sistema", "Qtd Contada", "Diferença",
      "Preço Médio", "Valor Sistema", "Valor Contado", "Divergência",
    ]],
    body: itens.map(i => {
      const vs = Number(i.quantidade_un_sistema) * Number(i.preco_medio_pond);
      const vc = Number(i.quantidade_contada) * Number(i.preco_medio_pond);
      return [
        i.produto,
        i.part_number ?? "",
        i.designacao ?? "",
        i.localizacao ?? "",
        i.unidade_un ?? "",
        num(i.quantidade_un_sistema, 0),
        num(i.quantidade_contada, 0),
        (Number(i.diferenca) > 0 ? "+" : "") + num(i.diferenca, 0),
        brl(i.preco_medio_pond),
        brl(vs),
        brl(vc),
        brl(i.valor_divergencia),
      ];
    }),
    foot: [[
      "TOTAL", "", "", "", "",
      num(itens.reduce((s, i) => s + Number(i.quantidade_un_sistema), 0), 0),
      num(itens.reduce((s, i) => s + Number(i.quantidade_contada), 0), 0),
      num(itens.reduce((s, i) => s + Number(i.diferenca), 0), 0),
      "",
      brl(valorSistema),
      brl(valorContado),
      brl(totalDiv),
    ]],
    theme: "striped",
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    styles: { cellPadding: 1.5, overflow: "linebreak" },
    columnStyles: {
      5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
      8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 7) {
        const raw = String(data.cell.raw ?? "0").replace("+", "").replace(/\./g, "").replace(",", ".");
        const n = Number(raw);
        if (n !== 0) {
          data.cell.styles.textColor = n < 0 ? [185, 28, 28] : [180, 83, 9];
          data.cell.styles.fontStyle = "bold";
        }
      }
      if (data.section === "body" && data.column.index === 11) {
        const raw = String(data.cell.raw ?? "");
        if (raw && !raw.includes("R$ 0,00")) {
          data.cell.styles.textColor = [185, 28, 28];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    didDrawPage: () => {
      const pageCount = doc.getNumberOfPages();
      const pageCurrent = doc.getCurrentPageInfo().pageNumber;
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Página ${pageCurrent} de ${pageCount}`, 297 - 10, 205, { align: "right" });
    },
    margin: { left: 10, right: 10 },
  });

  doc.save(`${inv.nome_inventario.replace(/\s+/g, "_")}.pdf`);
}

// Motor de detecção — DUPLA PASSAGEM com reconciliação para maximizar precisão.
// Estrutura preparada para futuramente rotear para modelos ONNX/YOLO locais
// sem alterar as chamadas dos componentes.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RawDet = { x: number; y: number; w: number; h: number; confianca: number };

type ProInput = {
  imageBase64: string;
  mimeType: string;
  pieceType: "parafuso" | "porca" | "arruela" | "outro";
  promptHint: string;
};

export type ProDetectionResult = {
  detections: (RawDet & { classe: string })[];
  passadas: number;
  divergencia: number;
  confianca_media: number;
  detalhes: string | null;
};

export const detectarObjetosPro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: ProInput) => {
    if (!d?.imageBase64) throw new Error("Imagem ausente");
    if (!d.mimeType?.startsWith("image/")) throw new Error("Tipo inválido");
    if (!["parafuso", "porca", "arruela", "outro"].includes(d.pieceType)) {
      throw new Error("Tipo de peça inválido");
    }
    return d;
  })
  .handler(async ({ data }): Promise<ProDetectionResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente");

    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;

    // --------- PASSADA 1: detector estrito ---------
    const pass1 = await callDetector({
      dataUrl,
      key,
      pieceType: data.pieceType,
      promptHint: data.promptHint,
      focus: "primeira análise",
    });

    // --------- PASSADA 2: verificador (prompt diferente para reduzir viés) ---------
    const pass2 = await callDetector({
      dataUrl,
      key,
      pieceType: data.pieceType,
      promptHint: data.promptHint,
      focus:
        "segunda análise INDEPENDENTE de verificação — reconte do zero, sem consultar contagem anterior. Preste atenção especial em peças na borda da imagem, encostadas ou parcialmente sobrepostas.",
    });

    const c1 = pass1.detections.length;
    const c2 = pass2.detections.length;
    const maxC = Math.max(c1, c2, 1);
    const divergencia = Math.abs(c1 - c2) / maxC;

    let chosen = c1 >= c2 ? pass1 : pass2; // por padrão, o maior tende a capturar mais
    let passadas = 2;

    // Se divergência > 15%, chama uma 3ª passada como árbitro e escolhe a mediana
    if (divergencia > 0.15) {
      const pass3 = await callDetector({
        dataUrl,
        key,
        pieceType: data.pieceType,
        promptHint: data.promptHint,
        focus:
          "TERCEIRA análise árbitro. Duas análises anteriores divergiram. Seja meticuloso: divida mentalmente a imagem em 9 quadrantes e conte peça por peça.",
      });
      passadas = 3;
      const counts = [
        { r: pass1, n: c1 },
        { r: pass2, n: c2 },
        { r: pass3, n: pass3.detections.length },
      ].sort((a, b) => a.n - b.n);
      chosen = counts[1].r; // mediana
    }

    // Merge de detecções próximas (NMS simples entre passadas, para eliminar duplicatas)
    const merged = nmsMerge(chosen.detections, 0.35);

    const conf =
      merged.length > 0
        ? merged.reduce((s, d) => s + d.confianca, 0) / merged.length
        : 0;

    return {
      detections: merged.map((d) => ({ ...d, classe: data.pieceType })),
      passadas,
      divergencia,
      confianca_media: conf * (divergencia > 0.2 ? 0.85 : 1),
      detalhes: chosen.detalhes,
    };
  });

// ------------------- helpers -------------------

async function callDetector(args: {
  dataUrl: string;
  key: string;
  pieceType: string;
  promptHint: string;
  focus: string;
}): Promise<{ detections: RawDet[]; detalhes: string | null }> {
  const system =
    `Você é um sistema profissional de visão computacional para inventário industrial. ${args.focus}. ` +
    `${args.promptHint} ` +
    "REGRAS ESTRITAS de bounding box: " +
    "1) Coordenadas normalizadas [0,1] (0,0 = topo-esquerda). " +
    "2) (x,y) é o CENTRO GEOMÉTRICO do objeto — nunca canto. " +
    "3) (w,h) justos ao contorno da peça. " +
    "4) Conte CADA UNIDADE individual, mesmo encostadas. " +
    "5) NÃO marque sombras, reflexos, óleo, ferrugem, manchas, riscos, texturas, mãos, ferramentas, fundo. " +
    "6) Antes de responder, revise mentalmente se cada (x,y) cai SOBRE o pixel do objeto. " +
    'Responda SOMENTE JSON: {"detalhes": string, "detections": [{"x": number, "y": number, "w": number, "h": number, "confianca": number}]}';

  const body = {
    model: "google/gemini-2.5-pro",
    messages: [
      { role: "system", content: system },
      {
        role: "user",
        content: [
          { type: "text", text: `Conte todas as unidades de ${args.pieceType} visíveis. Retorne apenas JSON.` },
          { type: "image_url", image_url: { url: args.dataUrl } },
        ],
      },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": args.key },
    body: JSON.stringify(body),
  });

  if (res.status === 429) throw new Error("Limite de uso da IA atingido. Aguarde alguns instantes.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha na análise (${res.status}): ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "{}";
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(content); } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
  }

  const arr = Array.isArray(parsed.detections) ? parsed.detections : [];
  const dets: RawDet[] = arr
    .map((d: unknown) => {
      const o = d as Record<string, unknown>;
      return {
        x: clamp01(Number(o.x)),
        y: clamp01(Number(o.y)),
        w: clamp01(Number(o.w)),
        h: clamp01(Number(o.h)),
        confianca: clamp01(Number(o.confianca ?? 0.8)),
      };
    })
    .filter((d) => d.w > 0.005 && d.h > 0.005);

  return { detections: dets, detalhes: typeof parsed.detalhes === "string" ? parsed.detalhes : null };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Elimina bounding boxes duplicadas usando IoU. */
function nmsMerge(dets: RawDet[], iouThresh: number): RawDet[] {
  const sorted = [...dets].sort((a, b) => b.confianca - a.confianca);
  const kept: RawDet[] = [];
  for (const d of sorted) {
    let dup = false;
    for (const k of kept) {
      if (iou(d, k) > iouThresh) { dup = true; break; }
    }
    if (!dup) kept.push(d);
  }
  return kept;
}

function iou(a: RawDet, b: RawDet): number {
  const ax1 = a.x - a.w / 2, ay1 = a.y - a.h / 2, ax2 = a.x + a.w / 2, ay2 = a.y + a.h / 2;
  const bx1 = b.x - b.w / 2, by1 = b.y - b.h / 2, bx2 = b.x + b.w / 2, by2 = b.y + b.h / 2;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

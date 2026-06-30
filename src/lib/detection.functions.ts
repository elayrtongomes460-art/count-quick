import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Detection = {
  /** normalized 0-1 center x */
  x: number;
  /** normalized 0-1 center y */
  y: number;
  /** normalized 0-1 width */
  w: number;
  /** normalized 0-1 height */
  h: number;
  /** detected class label (parafuso, porca, arruela, rebite, caixa, etc.) */
  classe: string;
  /** 0-1 model confidence */
  confianca: number;
};

export type DetectionResult = {
  detections: Detection[];
  classeDominante: string;
  total: number;
  confianca_media: number;
  detalhes: string | null;
};

type Input = {
  imageBase64: string;
  mimeType: string;
  classeHint?: string;
};

export const detectarObjetos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => {
    if (!d || typeof d.imageBase64 !== "string" || !d.imageBase64.length) {
      throw new Error("Imagem ausente");
    }
    if (typeof d.mimeType !== "string" || !d.mimeType.startsWith("image/")) {
      throw new Error("Tipo de imagem inválido");
    }
    return d;
  })
  .handler(async ({ data }): Promise<DetectionResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente no servidor");

    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;
    const hint = data.classeHint?.trim();

    const system =
      "Você é um sistema profissional de visão computacional para contagem de itens em estoque industrial, similar ao CountThings from Photos. " +
      "Sua tarefa é localizar com PRECISÃO ESPACIAL cada objeto visível da classe predominante. " +
      "REGRAS CRÍTICAS DE BOUNDING BOX: " +
      "1) Coordenadas normalizadas no intervalo [0,1] relativas à imagem inteira (0,0 = canto superior esquerdo; 1,1 = canto inferior direito). " +
      "2) (x, y) é o CENTRO GEOMÉTRICO do objeto — não o canto. Posicione exatamente sobre o corpo do item. " +
      "3) (w, h) é a largura e altura do objeto na imagem, justas ao seu contorno (sem padding excessivo). " +
      "4) Conte CADA UNIDADE individual, mesmo que estejam encostadas ou parcialmente sobrepostas. " +
      "5) Se houver dúvida entre dois objetos colados, prefira marcar os dois centros separados. " +
      "6) NÃO marque sombras, reflexos, fundo, mãos, ferramentas ou objetos de outra classe. " +
      "7) Verifique mentalmente cada coordenada antes de responder: o ponto (x,y) DEVE cair sobre o pixel do objeto. " +
      "Classes possíveis: parafuso, porca, arruela, rebite, prego, pino, bucha, caixa, peça metálica, tubo, chapa, saco, bombona. " +
      "Se a imagem não contiver itens contáveis, retorne detections vazio. " +
      "Responda SOMENTE com JSON válido no formato: " +
      `{"classe_dominante": string, "detalhes": string, "detections": [{"classe": string, "confianca": number, "x": number, "y": number, "w": number, "h": number}]}`;

    const userText = hint
      ? `Conte todos os objetos da classe "${hint}" visíveis na imagem. Retorne apenas JSON.`
      : "Detecte a classe predominante de item de estoque e conte todos os objetos visíveis dessa classe. Retorne apenas JSON.";

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: { type: "json_object" },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) throw new Error("Limite de uso da IA atingido. Tente novamente em instantes.");
    if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Falha na detecção (${res.status}): ${txt.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    const rawDetections = Array.isArray(parsed.detections) ? parsed.detections : [];
    const clamp01 = (n: unknown) => {
      const x = Number(n);
      if (!Number.isFinite(x)) return 0;
      return Math.max(0, Math.min(1, x));
    };
    const detections: Detection[] = rawDetections
      .map((d: unknown) => {
        const o = d as Record<string, unknown>;
        return {
          x: clamp01(o.x),
          y: clamp01(o.y),
          w: clamp01(o.w),
          h: clamp01(o.h),
          classe: typeof o.classe === "string" ? o.classe : (hint || "item"),
          confianca: clamp01(o.confianca),
        };
      })
      .filter((d) => d.w > 0.001 && d.h > 0.001);

    const classeDominante =
      typeof parsed.classe_dominante === "string" && parsed.classe_dominante
        ? parsed.classe_dominante
        : (hint || (detections[0]?.classe ?? "item"));

    const conf =
      detections.length > 0
        ? detections.reduce((s, d) => s + d.confianca, 0) / detections.length
        : 0;

    return {
      detections,
      classeDominante,
      total: detections.length,
      confianca_media: conf,
      detalhes: typeof parsed.detalhes === "string" ? parsed.detalhes : null,
    };
  });

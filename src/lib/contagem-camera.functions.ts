import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AnalyseInput = { imageBase64: string; mimeType: string };
type AnalyseResult = {
  quantidade_parafusos: number;
  quantidade_porcas: number;
  quantidade_arruelas: number;
  total_itens: number;
  confianca: number | null;
  detalhes: string | null;
};

export const analisarImagemContagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AnalyseInput) => {
    if (!d || typeof d.imageBase64 !== "string" || !d.imageBase64.length) {
      throw new Error("Imagem ausente");
    }
    if (typeof d.mimeType !== "string" || !d.mimeType.startsWith("image/")) {
      throw new Error("Tipo de imagem inválido");
    }
    return d;
  })
  .handler(async ({ data }): Promise<AnalyseResult> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY ausente no servidor");

    const dataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;
    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content:
            "Você é um assistente de contagem visual de itens de estoque. Conte na imagem objetos das classes: parafuso, porca, arruela. Responda APENAS com JSON válido nas chaves exatas: quantidade_parafusos, quantidade_porcas, quantidade_arruelas, total_itens, confianca (0-1), detalhes (texto curto). Não invente itens; se nenhum estiver visível, retorne zeros.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Conte parafusos, porcas e arruelas nesta foto. Retorne só o JSON.",
            },
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
      throw new Error(`Falha na análise (${res.status}): ${txt.slice(0, 200)}`);
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

    const n = (v: unknown) => {
      const x = Number(v);
      return Number.isFinite(x) && x >= 0 ? Math.round(x) : 0;
    };
    const parafusos = n(parsed.quantidade_parafusos);
    const porcas = n(parsed.quantidade_porcas);
    const arruelas = n(parsed.quantidade_arruelas);
    const total =
      n(parsed.total_itens) || parafusos + porcas + arruelas;
    const confRaw = Number(parsed.confianca);
    const confianca =
      Number.isFinite(confRaw) ? Math.max(0, Math.min(1, confRaw)) : null;

    return {
      quantidade_parafusos: parafusos,
      quantidade_porcas: porcas,
      quantidade_arruelas: arruelas,
      total_itens: total,
      confianca,
      detalhes: typeof parsed.detalhes === "string" ? parsed.detalhes : null,
    };
  });

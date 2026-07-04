// Tipos compartilhados do motor de contagem inteligente.
// Arquitetura modular preparada para plugar modelos ONNX/YOLO locais no futuro
// sem alterar UI/histórico/exportação.

export type PieceType = "parafuso" | "porca" | "arruela" | "outro";

export type MarkerSource = "ai" | "manual";

export type Marker = {
  id: string;
  /** centro X normalizado 0..1 */
  x: number;
  /** centro Y normalizado 0..1 */
  y: number;
  /** largura normalizada 0..1 */
  w: number;
  /** altura normalizada 0..1 */
  h: number;
  confianca: number;
  source: MarkerSource;
};

export type AnalysisResult = {
  markers: Marker[];
  classe: PieceType;
  confianca_media: number;
  passadas: number;
  tempo_ms: number;
  detalhes: string | null;
  divergencia: number;
};

export type PieceProfile = {
  key: PieceType;
  label: string;
  emoji: string;
  descricao: string;
  /** Instrução extra injetada no prompt do modelo. */
  promptHint: string;
  /** Tamanho médio esperado (fração da menor dimensão da imagem). Usado como
   *  bounding-box default para markers manuais. */
  defaultBoxFrac: number;
};

export const PIECE_PROFILES: Record<PieceType, PieceProfile> = {
  parafuso: {
    key: "parafuso",
    label: "Parafuso",
    emoji: "🔩",
    descricao: "Parafusos, prisioneiros, pinos roscados.",
    promptHint:
      "Alvo: PARAFUSOS (haste + cabeça). Marque o CENTRO da CABEÇA (parte mais visível). Ignore fios de rosca sozinhos, sombras alongadas e cabos.",
    defaultBoxFrac: 0.05,
  },
  porca: {
    key: "porca",
    label: "Porca",
    emoji: "⬢",
    descricao: "Porcas sextavadas, quadradas, borboleta.",
    promptHint:
      "Alvo: PORCAS (formato hexagonal ou quadrado com furo central). Marque o CENTRO GEOMÉTRICO do polígono. Não confunda com arruelas (arruela é chapa fina, porca tem altura).",
    defaultBoxFrac: 0.055,
  },
  arruela: {
    key: "arruela",
    label: "Arruela",
    emoji: "◯",
    descricao: "Arruelas lisas, de pressão, dentadas.",
    promptHint:
      "Alvo: ARRUELAS (anel/disco fino com furo). Marque o CENTRO do furo. Cada arruela empilhada conta 1 se for possível distinguir bordas; se estiverem fundidas, conte só uma vez.",
    defaultBoxFrac: 0.06,
  },
  outro: {
    key: "outro",
    label: "Outro",
    emoji: "◆",
    descricao: "Rebite, bucha, pino, peça avulsa.",
    promptHint:
      "Alvo: peça individual predominante na imagem. Marque o CENTRO GEOMÉTRICO de cada unidade.",
    defaultBoxFrac: 0.055,
  },
};

export const PIECE_LIST: PieceProfile[] = [
  PIECE_PROFILES.parafuso,
  PIECE_PROFILES.porca,
  PIECE_PROFILES.arruela,
  PIECE_PROFILES.outro,
];

export type ProgressStep =
  | "resize"
  | "wb"
  | "contrast"
  | "denoise"
  | "sharpen"
  | "gamma"
  | "encode"
  | "ai_pass_1"
  | "ai_pass_2"
  | "reconcile"
  | "done";

export type ProgressEvent = {
  step: ProgressStep;
  label: string;
  pct: number;
};

export function newMarkerId(): string {
  return Math.random().toString(36).slice(2, 10);
}

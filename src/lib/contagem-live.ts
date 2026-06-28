// Camada de visão computacional para contagem ao vivo.
// Arquitetura plugável: qualquer detector que implemente `LiveDetector`
// pode ser trocado sem mexer no resto do app (YOLO/TFLite/ONNX no futuro).

export type BBox = { x: number; y: number; w: number; h: number };

export type Detection = {
  bbox: BBox;
  score: number;
  rawClass: string;
};

export interface LiveDetector {
  /** Carrega o modelo. Deve ser idempotente. */
  load(): Promise<void>;
  /** Detecta objetos em um frame de vídeo. */
  detect(video: HTMLVideoElement): Promise<Detection[]>;
  /** Libera recursos. */
  dispose?(): void;
}

export type Categoria = "parafuso" | "porca" | "arruela" | "outro";

/**
 * Mapeia classes do detector para categorias do app.
 * coco-ssd não tem classes de fixação; usamos heurística por forma/tamanho
 * + heurística da classe (objetos pequenos/redondos).
 * Quando trocarmos por um modelo treinado (YOLO custom), basta atualizar
 * esta função ou substituir o detector.
 */
export function classifyDetection(d: Detection, alvo: Categoria): Categoria | null {
  const { w, h } = d.bbox;
  if (w <= 0 || h <= 0) return null;
  const aspect = w / h;
  const area = w * h;
  if (area < 80) return null; // ruído

  // Para "outro", aceita qualquer detecção válida.
  if (alvo === "outro") return "outro";

  // Heurísticas geométricas:
  // - arruela: praticamente circular -> aspecto ~1
  // - porca: hexagonal -> aspecto ~1 também, geralmente um pouco maior
  // - parafuso: alongado -> aspecto bem diferente de 1
  const ratio = aspect > 1 ? aspect : 1 / aspect;

  if (alvo === "parafuso") {
    return ratio >= 1.6 ? "parafuso" : null;
  }
  if (alvo === "arruela") {
    return ratio <= 1.25 ? "arruela" : null;
  }
  if (alvo === "porca") {
    return ratio <= 1.35 ? "porca" : null;
  }
  return null;
}

// ---------- Tracker simples por IoU + centróide ----------

type Track = {
  id: number;
  bbox: BBox;
  lastSeen: number;
  hits: number;
  counted: boolean;
  categoria: Categoria;
};

function iou(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

export class ObjectTracker {
  private tracks = new Map<number, Track>();
  private nextId = 1;
  private frame = 0;
  // Frames consecutivos detectado para validar (evita falsos positivos).
  private readonly minHits = 2;
  // Frames sem aparecer antes de remover.
  private readonly maxAge = 15;
  // IoU mínimo para reaproveitar um track.
  private readonly iouThreshold = 0.25;

  reset() {
    this.tracks.clear();
    this.nextId = 1;
    this.frame = 0;
  }

  /**
   * Atualiza tracks com as detecções do frame atual e retorna
   * quantos novos objetos foram contabilizados por categoria.
   */
  update(detections: { bbox: BBox; categoria: Categoria }[]): {
    novos: Record<Categoria, number>;
    ativos: { bbox: BBox; categoria: Categoria; id: number; counted: boolean }[];
  } {
    this.frame++;
    const novos: Record<Categoria, number> = {
      parafuso: 0,
      porca: 0,
      arruela: 0,
      outro: 0,
    };

    const usados = new Set<number>();
    // Match guloso por melhor IoU.
    for (const det of detections) {
      let bestId = -1;
      let bestIou = this.iouThreshold;
      for (const [id, t] of this.tracks) {
        if (usados.has(id)) continue;
        if (t.categoria !== det.categoria) continue;
        const v = iou(t.bbox, det.bbox);
        if (v > bestIou) {
          bestIou = v;
          bestId = id;
        }
      }
      if (bestId >= 0) {
        const t = this.tracks.get(bestId)!;
        t.bbox = det.bbox;
        t.lastSeen = this.frame;
        t.hits++;
        usados.add(bestId);
        if (!t.counted && t.hits >= this.minHits) {
          t.counted = true;
          novos[t.categoria]++;
        }
      } else {
        const id = this.nextId++;
        this.tracks.set(id, {
          id,
          bbox: det.bbox,
          lastSeen: this.frame,
          hits: 1,
          counted: false,
          categoria: det.categoria,
        });
        usados.add(id);
      }
    }

    // Expira tracks antigos.
    for (const [id, t] of this.tracks) {
      if (this.frame - t.lastSeen > this.maxAge) this.tracks.delete(id);
    }

    const ativos = Array.from(this.tracks.values()).map((t) => ({
      bbox: t.bbox,
      categoria: t.categoria,
      id: t.id,
      counted: t.counted,
    }));

    return { novos, ativos };
  }
}

// ---------- Detector padrão: COCO-SSD (TensorFlow.js) ----------
// Modelo genérico, leve, roda no navegador. Serve como baseline até
// um modelo dedicado (YOLO custom para fixação) ser disponibilizado.
// A interface `LiveDetector` permite trocar sem alterar a tela.

export class CocoSsdDetector implements LiveDetector {
  private model: unknown = null;

  async load() {
    if (this.model) return;
    const tf = await import("@tensorflow/tfjs");
    await tf.ready();
    const cocoSsd = await import("@tensorflow-models/coco-ssd");
    this.model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
  }

  async detect(video: HTMLVideoElement): Promise<Detection[]> {
    if (!this.model) await this.load();
    const m = this.model as {
      detect: (
        v: HTMLVideoElement,
        maxN?: number,
        minScore?: number,
      ) => Promise<{ bbox: [number, number, number, number]; class: string; score: number }[]>;
    };
    const preds = await m.detect(video, 40, 0.35);
    return preds.map((p) => ({
      bbox: { x: p.bbox[0], y: p.bbox[1], w: p.bbox[2], h: p.bbox[3] },
      score: p.score,
      rawClass: p.class,
    }));
  }
}

export function createDefaultDetector(): LiveDetector {
  return new CocoSsdDetector();
}

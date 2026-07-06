// Motor de detecção LOCAL — inferência 100% no dispositivo.
// Nenhum dado é enviado a serviços externos.
//
// Arquitetura plugável: quando um modelo ONNX/TFLite treinado
// for adicionado em /public/models/, basta implementar o backend
// correspondente e registrá-lo em BACKENDS. A UI não muda.
//
// Enquanto o modelo especializado não existe, usamos um detector
// heurístico de "blobs" (limiar Otsu + componentes conectados) que
// funciona razoavelmente para peças sobre fundo contrastante e serve
// como fallback de desenvolvimento. O usuário sempre pode refinar
// manualmente as bolinhas na tela de revisão.

import type { PieceType, ProgressEvent } from "./types";

export type LocalDetection = {
  x: number; y: number; w: number; h: number; confianca: number;
};

export type LocalDetectionResult = {
  detections: LocalDetection[];
  backend: string;
  passadas: number;
  divergencia: number;
  confianca_media: number;
  detalhes: string | null;
};

export interface DetectionBackend {
  name: string;
  /** true se o backend está pronto (modelo carregado, WebGPU/WASM ok, etc). */
  isReady(): Promise<boolean>;
  detect(img: ImageData, pieceType: PieceType): Promise<LocalDetection[]>;
}

// ---------------------------------------------------------------
// Backend ONNX (placeholder). Ativa-se automaticamente quando um
// arquivo /public/models/detector.onnx for adicionado ao projeto
// e a dependência onnxruntime-web for instalada. Mantém a mesma
// interface — nada muda para a UI.
// ---------------------------------------------------------------
const onnxBackend: DetectionBackend = {
  name: "onnx-local",
  async isReady() {
    try {
      const r = await fetch("/models/detector.onnx", { method: "HEAD" });
      if (!r.ok) return false;
      // dynamic import via variável — evita que o Vite tente resolver
      // "onnxruntime-web" em build/dev enquanto o pacote não estiver instalado.
      const mod = "onnxruntime-web";
      const loader = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;
      await loader(mod).catch(() => { throw new Error("ort-missing"); });
      return true;
    } catch { return false; }
  },
  async detect() {
    // Implementação real será plugada quando o modelo estiver disponível.
    throw new Error("Modelo ONNX local ainda não configurado.");
  },
};

// ---------------------------------------------------------------
// Backend heurístico (fallback de desenvolvimento).
// Otsu global → componentes conectados → filtro por área e forma.
// ---------------------------------------------------------------
const heuristicBackend: DetectionBackend = {
  name: "heuristic-blob-v1",
  async isReady() { return true; },
  async detect(img, pieceType) {
    const { width: W, height: H, data } = img;
    const N = W * H;

    // 1) luminância
    const lum = new Uint8ClampedArray(N);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      lum[j] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    }

    // 2) Otsu
    const hist = new Uint32Array(256);
    for (let i = 0; i < N; i++) hist[lum[i]]++;
    let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, varMax = 0, thresh = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = N - wB; if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > varMax) { varMax = v; thresh = t; }
    }

    // 3) Decide polaridade: peças costumam ser mais escuras que o fundo
    let bright = 0, dark = 0;
    for (let i = 0; i < N; i++) (lum[i] > thresh ? bright++ : dark++);
    const foregroundIsDark = dark < bright; // menos numeroso = objeto
    const mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const isDark = lum[i] <= thresh;
      mask[i] = (foregroundIsDark ? isDark : !isDark) ? 1 : 0;
    }

    // 4) Componentes conectados (4-vizinhança, BFS iterativa)
    const labels = new Int32Array(N);
    const stack = new Int32Array(N);
    type Comp = { minX: number; minY: number; maxX: number; maxY: number; area: number };
    const comps: Comp[] = [];
    let next = 1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        if (!mask[idx] || labels[idx]) continue;
        let top = 0;
        stack[top++] = idx;
        labels[idx] = next;
        let minX = x, minY = y, maxX = x, maxY = y, area = 0;
        while (top > 0) {
          const p = stack[--top];
          const py = (p / W) | 0, px = p - py * W;
          area++;
          if (px < minX) minX = px; if (px > maxX) maxX = px;
          if (py < minY) minY = py; if (py > maxY) maxY = py;
          if (px > 0)     { const n = p - 1;  if (mask[n] && !labels[n]) { labels[n] = next; stack[top++] = n; } }
          if (px < W - 1) { const n = p + 1;  if (mask[n] && !labels[n]) { labels[n] = next; stack[top++] = n; } }
          if (py > 0)     { const n = p - W;  if (mask[n] && !labels[n]) { labels[n] = next; stack[top++] = n; } }
          if (py < H - 1) { const n = p + W;  if (mask[n] && !labels[n]) { labels[n] = next; stack[top++] = n; } }
        }
        comps.push({ minX, minY, maxX, maxY, area });
        next++;
      }
    }

    // 5) Filtragem por tamanho esperado da peça
    const minSide = Math.min(W, H);
    const expected = expectedSizeFor(pieceType) * minSide;
    const minArea = Math.max(25, (expected * expected) * 0.15);
    const maxArea = (expected * expected) * 6;
    const dets: LocalDetection[] = [];
    for (const c of comps) {
      if (c.area < minArea || c.area > maxArea) continue;
      const bw = c.maxX - c.minX + 1;
      const bh = c.maxY - c.minY + 1;
      const aspect = bw / bh;
      if (aspect < 0.35 || aspect > 3.0) continue;
      const cx = (c.minX + c.maxX) / 2 / W;
      const cy = (c.minY + c.maxY) / 2 / H;
      // confiança grosseira baseada em quão próximo do tamanho esperado
      const sizeRatio = Math.sqrt(c.area) / expected;
      const conf = 1 - Math.min(0.7, Math.abs(1 - sizeRatio) * 0.6);
      dets.push({
        x: cx, y: cy,
        w: Math.min(1, bw / W),
        h: Math.min(1, bh / H),
        confianca: Math.max(0.3, conf),
      });
    }

    // 6) NMS interno
    return nms(dets, 0.4);
  },
};

// ---------------------------------------------------------------
// Registro de backends — a ordem define a prioridade.
// ---------------------------------------------------------------
const BACKENDS: DetectionBackend[] = [onnxBackend, heuristicBackend];

async function pickBackend(): Promise<DetectionBackend> {
  for (const b of BACKENDS) {
    try { if (await b.isReady()) return b; } catch { /* try next */ }
  }
  return heuristicBackend;
}

// ---------------------------------------------------------------
// API pública consumida pela UI.
// ---------------------------------------------------------------
export async function detectLocal(
  processedBlob: Blob,
  pieceType: PieceType,
  onProgress: (e: ProgressEvent) => void,
): Promise<LocalDetectionResult> {
  onProgress({ step: "ai_pass_1", label: "Carregando modelo local", pct: 45 });
  const backend = await pickBackend();

  onProgress({ step: "ai_pass_1", label: `Inferência local (${backend.name})`, pct: 60 });
  const img = await blobToImageData(processedBlob);

  const pass1 = await backend.detect(img, pieceType);

  // Segunda passada com leve variação (equalização adicional) para
  // reconciliar contagem e reduzir falso negativo/positivo.
  onProgress({ step: "ai_pass_2", label: "Validação (2ª passada local)", pct: 80 });
  const img2 = boostContrast(img);
  const pass2 = await backend.detect(img2, pieceType);

  onProgress({ step: "reconcile", label: "Reconciliando resultados", pct: 92 });
  const merged = nms([...pass1, ...pass2], 0.4);

  const c1 = pass1.length, c2 = pass2.length;
  const divergencia = Math.abs(c1 - c2) / Math.max(1, Math.max(c1, c2));
  const conf = merged.length
    ? merged.reduce((s, d) => s + d.confianca, 0) / merged.length
    : 0;

  return {
    detections: merged,
    backend: backend.name,
    passadas: 2,
    divergencia,
    confianca_media: conf * (divergencia > 0.3 ? 0.85 : 1),
    detalhes: backend.name === "heuristic-blob-v1"
      ? "Detector heurístico local (dev). Ajuste manualmente as bolinhas se necessário. Adicione um modelo ONNX em /models/detector.onnx para maior precisão."
      : null,
  };
}

// ---------- helpers ----------

function expectedSizeFor(t: PieceType): number {
  switch (t) {
    case "parafuso": return 0.05;
    case "porca":    return 0.055;
    case "arruela":  return 0.06;
    default:         return 0.055;
  }
}

async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement("canvas");
  c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();
  return ctx.getImageData(0, 0, c.width, c.height);
}

function boostContrast(img: ImageData): ImageData {
  const out = new ImageData(new Uint8ClampedArray(img.data), img.width, img.height);
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    for (let k = 0; k < 3; k++) {
      const v = d[i + k];
      const b = (v - 128) * 1.25 + 128;
      d[i + k] = b < 0 ? 0 : b > 255 ? 255 : b;
    }
  }
  return out;
}

function nms(dets: LocalDetection[], iouThresh: number): LocalDetection[] {
  const sorted = [...dets].sort((a, b) => b.confianca - a.confianca);
  const kept: LocalDetection[] = [];
  for (const d of sorted) {
    let dup = false;
    for (const k of kept) if (iou(d, k) > iouThresh) { dup = true; break; }
    if (!dup) kept.push(d);
  }
  return kept;
}

function iou(a: LocalDetection, b: LocalDetection): number {
  const ax1 = a.x - a.w / 2, ay1 = a.y - a.h / 2, ax2 = a.x + a.w / 2, ay2 = a.y + a.h / 2;
  const bx1 = b.x - b.w / 2, by1 = b.y - b.h / 2, bx2 = b.x + b.w / 2, by2 = b.y + b.h / 2;
  const ix1 = Math.max(ax1, bx1), iy1 = Math.max(ay1, by1);
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix1), ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}

// Pipeline de pré-processamento client-side executado em <canvas>.
// Ordem: resize → white balance (gray world) → esticamento de contraste →
// denoise leve → unsharp mask → correção gama → encode.
// Cada etapa reporta progresso via callback.

import type { ProgressEvent } from "./types";

const STEP_ORDER: { key: ProgressEvent["step"]; label: string }[] = [
  { key: "resize", label: "Redimensionando" },
  { key: "wb", label: "Corrigindo iluminação" },
  { key: "contrast", label: "Ajustando contraste" },
  { key: "denoise", label: "Reduzindo ruído" },
  { key: "sharpen", label: "Aumentando nitidez" },
  { key: "gamma", label: "Normalizando exposição" },
  { key: "encode", label: "Preparando envio" },
];

const PREPROCESS_WEIGHT = 30; // % do total até enviar para IA

export type PreprocessOutput = {
  original: { url: string; w: number; h: number };
  processed: { blob: Blob; url: string; base64: string; w: number; h: number };
};

export async function preprocessImage(
  source: HTMLVideoElement | HTMLImageElement | Blob,
  onProgress: (e: ProgressEvent) => void,
  maxSide = 1600,
): Promise<PreprocessOutput> {
  const emit = (idx: number) => {
    const s = STEP_ORDER[idx];
    onProgress({ step: s.key, label: s.label, pct: Math.round(((idx + 1) / STEP_ORDER.length) * PREPROCESS_WEIGHT) });
  };

  // ---- Load source into ImageBitmap ----
  const bitmap = await loadBitmap(source);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  // 1) Resize
  const scale = Math.min(1, maxSide / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * scale));
  const h = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  emit(0);

  // Snapshot da original (antes das correções) para comparação
  const originalCanvas = document.createElement("canvas");
  originalCanvas.width = w;
  originalCanvas.height = h;
  originalCanvas.getContext("2d")!.drawImage(canvas, 0, 0);
  const originalBlob = await canvasToBlob(originalCanvas, 0.9);
  const originalUrl = URL.createObjectURL(originalBlob);

  // Grab pixels once
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  // 2) Gray-world white balance
  await yieldToUI();
  grayWorldWB(data);
  emit(1);

  // 3) Contrast stretch (percentile-based)
  await yieldToUI();
  contrastStretch(data, 0.01, 0.99);
  emit(2);

  // 4) Denoise (box blur 3x3 leve — aplica só se imagem grande)
  await yieldToUI();
  if (Math.max(w, h) >= 900) boxBlur(data, w, h, 1);
  emit(3);

  // 5) Unsharp mask
  await yieldToUI();
  unsharpMask(data, w, h, 0.6);
  emit(4);

  // 6) Gamma
  await yieldToUI();
  const meanL = meanLuma(data);
  const target = 128;
  const gamma = Math.log(target / 255) / Math.log(Math.max(1, meanL) / 255);
  const gClamped = Math.max(0.7, Math.min(1.4, gamma));
  applyGamma(data, gClamped);
  emit(5);

  // 7) Encode
  ctx.putImageData(img, 0, 0);
  const blob = await canvasToBlob(canvas, 0.92);
  const base64 = await blobToBase64(blob);
  const url = URL.createObjectURL(blob);
  emit(6);

  return {
    original: { url: originalUrl, w, h },
    processed: { blob, url, base64, w, h },
  };
}

// ---------- helpers ----------

async function loadBitmap(src: HTMLVideoElement | HTMLImageElement | Blob): Promise<ImageBitmap> {
  if (src instanceof Blob) return createImageBitmap(src);
  if (src instanceof HTMLVideoElement) return createImageBitmap(src);
  return createImageBitmap(src);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob falhou"))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf("base64,");
      resolve(i >= 0 ? s.slice(i + 7) : s);
    };
    r.readAsDataURL(blob);
  });
}

function yieldToUI() {
  return new Promise<void>((r) => setTimeout(r, 0));
}

function grayWorldWB(d: Uint8ClampedArray) {
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    rs += d[i]; gs += d[i + 1]; bs += d[i + 2]; n++;
  }
  const ra = rs / n, ga = gs / n, ba = bs / n;
  const avg = (ra + ga + ba) / 3;
  const kr = avg / Math.max(1, ra);
  const kg = avg / Math.max(1, ga);
  const kb = avg / Math.max(1, ba);
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp255(d[i]     * kr);
    d[i + 1] = clamp255(d[i + 1] * kg);
    d[i + 2] = clamp255(d[i + 2] * kb);
  }
}

function contrastStretch(d: Uint8ClampedArray, lowP: number, highP: number) {
  const hist = new Uint32Array(256);
  const total = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    const l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    hist[l]++;
  }
  const lowCount = total * lowP;
  const highCount = total * highP;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= lowCount) { lo = i; break; } }
  acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= highCount) { hi = i; break; } }
  if (hi - lo < 20) return;
  const scale = 255 / (hi - lo);
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp255((d[i] - lo) * scale);
    d[i + 1] = clamp255((d[i + 1] - lo) * scale);
    d[i + 2] = clamp255((d[i + 2] - lo) * scale);
  }
}

function boxBlur(d: Uint8ClampedArray, w: number, h: number, radius: number) {
  const src = new Uint8ClampedArray(d);
  const size = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= w) continue;
          const idx = (yy * w + xx) * 4;
          r += src[idx]; g += src[idx + 1]; b += src[idx + 2]; count++;
        }
      }
      const o = (y * w + x) * 4;
      d[o] = r / count; d[o + 1] = g / count; d[o + 2] = b / count;
    }
  }
  void size;
}

function unsharpMask(d: Uint8ClampedArray, w: number, h: number, amount: number) {
  const blurred = new Uint8ClampedArray(d);
  boxBlur(blurred, w, h, 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = clamp255(d[i]     + amount * (d[i]     - blurred[i]));
    d[i + 1] = clamp255(d[i + 1] + amount * (d[i + 1] - blurred[i + 1]));
    d[i + 2] = clamp255(d[i + 2] + amount * (d[i + 2] - blurred[i + 2]));
  }
}

function meanLuma(d: Uint8ClampedArray): number {
  let s = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) {
    s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    n++;
  }
  return s / n;
}

function applyGamma(d: Uint8ClampedArray, g: number) {
  const lut = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) lut[i] = clamp255(255 * Math.pow(i / 255, 1 / g));
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

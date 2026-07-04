// Gera imagem anotada (com bolinhas) para exportação/salvamento.
import type { Marker } from "./types";

export async function renderAnnotatedImage(
  imageBlob: Blob,
  markers: Marker[],
): Promise<Blob> {
  const bmp = await createImageBitmap(imageBlob);
  const w = bmp.width, h = bmp.height;
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  bmp.close?.();

  const base = Math.max(14, Math.round(Math.min(w, h) * 0.022));
  ctx.font = `bold ${base}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = Math.max(2, base * 0.14);

  markers.forEach((m, i) => {
    const cx = m.x * w, cy = m.y * h;
    const r = Math.max(base * 0.9, Math.min(w, h) * m.w * 0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = m.source === "manual" ? "rgba(16,185,129,0.92)" : "rgba(245,158,11,0.92)";
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.stroke();
    ctx.fillStyle = "white";
    ctx.fillText(String(i + 1), cx, cy + base * 0.05);
  });

  // legenda no rodapé
  const label = `Total: ${markers.length}`;
  ctx.font = `bold ${Math.round(base * 1.4)}px system-ui, sans-serif`;
  const padX = base, padY = base * 0.5;
  const tw = ctx.measureText(label).width;
  const bx = w - tw - padX * 3, by = h - base * 2.8;
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(bx, by, tw + padX * 2, base * 2.2);
  ctx.fillStyle = "white";
  ctx.textAlign = "left";
  ctx.fillText(label, bx + padX, by + base * 1.1 + padY);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("canvas.toBlob falhou"))),
      "image/jpeg",
      0.92,
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

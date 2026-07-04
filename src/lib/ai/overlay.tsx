// Overlay reutilizável com marcadores adicionáveis / removíveis / arrastáveis.
// Renderiza somente após a análise estar concluída.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Marker } from "./types";

type Props = {
  imageUrl: string;
  markers: Marker[];
  editable: boolean;
  onAdd: (nx: number, ny: number) => void;
  onMove: (id: string, nx: number, ny: number) => void;
  onRemove: (id: string) => void;
};

type ImgRect = { left: number; top: number; width: number; height: number };

export function DetectionOverlay({ imageUrl, markers, editable, onAdd, onMove, onRemove }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<ImgRect | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const dragMoved = useRef(false);

  const measure = useCallback(() => {
    const img = imgRef.current, wrap = wrapRef.current;
    if (!img || !wrap || !img.naturalWidth) return;
    const wr = wrap.getBoundingClientRect();
    const ratio = img.naturalWidth / img.naturalHeight;
    const wrapRatio = wr.width / wr.height;
    let dw: number, dh: number;
    if (ratio > wrapRatio) { dw = wr.width; dh = wr.width / ratio; }
    else { dh = wr.height; dw = wr.height * ratio; }
    setRect({ left: (wr.width - dw) / 2, top: (wr.height - dh) / 2, width: dw, height: dh });
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(() => measure());
    if (wrapRef.current) ro.observe(wrapRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); window.removeEventListener("orientationchange", measure); };
  }, [measure, imageUrl]);

  const clientToNorm = useCallback((cx: number, cy: number) => {
    if (!rect || !wrapRef.current) return null;
    const wr = wrapRef.current.getBoundingClientRect();
    const px = cx - wr.left - rect.left;
    const py = cy - wr.top - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return null;
    return { nx: px / rect.width, ny: py / rect.height };
  }, [rect]);

  const handleTap = (e: React.MouseEvent) => {
    if (!editable || dragging) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-marker]")) return;
    const n = clientToNorm(e.clientX, e.clientY);
    if (n) onAdd(n.nx, n.ny);
  };

  const beginDrag = (id: string) => (e: React.PointerEvent) => {
    if (!editable) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragMoved.current = false;
    setDragging(id);
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!dragging) return;
    const n = clientToNorm(e.clientX, e.clientY);
    if (n) { dragMoved.current = true; onMove(dragging, n.nx, n.ny); }
  };
  const endDrag = (id: string) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const moved = dragMoved.current;
    setDragging(null);
    if (!moved) onRemove(id);
  };

  return (
    <div
      ref={wrapRef}
      onClick={handleTap}
      className={`absolute inset-0 ${editable ? "cursor-crosshair" : ""} touch-none`}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt=""
        onLoad={measure}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        draggable={false}
      />
      {rect && markers.map((m, i) => {
        const cx = rect.left + m.x * rect.width;
        const cy = rect.top + m.y * rect.height;
        const bbox = Math.max(m.w * rect.width, m.h * rect.height);
        const size = Math.max(22, Math.min(48, bbox * 0.6));
        const isManual = m.source === "manual";
        return (
          <div
            key={m.id}
            data-marker
            onPointerDown={beginDrag(m.id)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag(m.id)}
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full font-bold border-2 border-white shadow-[0_2px_10px_rgba(0,0,0,0.6)] flex items-center justify-center ring-1 ring-black/30 ${
              isManual ? "bg-emerald-500 text-white" : "bg-accent text-accent-foreground"
            } ${dragging === m.id ? "scale-110" : ""}`}
            style={{
              left: cx, top: cy, width: size, height: size,
              fontSize: Math.max(10, size * 0.42),
              transition: dragging === m.id ? "none" : "transform 100ms",
            }}
            title={`${m.source === "manual" ? "Manual" : "IA"} · ${Math.round(m.confianca * 100)}%`}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

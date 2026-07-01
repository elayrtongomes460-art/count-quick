import { useEffect, useRef, useState } from "react";
import { Eraser, X, Check } from "lucide-react";

type Props = {
  open: boolean;
  title?: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void | Promise<void>;
};

export function SignaturePad({ open, title = "Assinatura do responsável", onCancel, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0F274B";
    ctx.lineWidth = 2.2;
    hasStrokeRef.current = false;
  }, [open]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = pos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasStrokeRef.current = true;
  };
  const onUp = () => { drawingRef.current = false; };

  const limpar = () => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    const rect = c.getBoundingClientRect();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    hasStrokeRef.current = false;
  };

  const confirmar = async () => {
    if (!hasStrokeRef.current) return;
    setSaving(true);
    try {
      const dataUrl = canvasRef.current!.toDataURL("image/png");
      await onConfirm(dataUrl);
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-lg border border-border shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onCancel} className="p-1.5 rounded-md hover:bg-muted" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Assine dentro do quadro abaixo com o dedo ou o mouse. A assinatura será impressa no relatório PDF.
          </p>
          <div className="rounded-xl border-2 border-dashed border-border bg-white">
            <canvas
              ref={canvasRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerLeave={onUp}
              className="block w-full h-56 touch-none rounded-xl"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={limpar} className="py-2.5 rounded-lg bg-secondary font-semibold flex items-center justify-center gap-2">
              <Eraser className="size-4" /> Limpar
            </button>
            <button
              onClick={confirmar}
              disabled={saving}
              className="py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <Check className="size-4" /> {saving ? "Salvando…" : "Confirmar e finalizar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

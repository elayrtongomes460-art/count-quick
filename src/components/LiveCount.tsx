import { useEffect, useRef, useState } from "react";
import { Loader2, Play, Square, Video } from "lucide-react";
import { toast } from "sonner";
import {
  type Categoria,
  type LiveDetector,
  classifyDetection,
  createDefaultDetector,
  ObjectTracker,
} from "@/lib/contagem-live";

type Counts = Record<Categoria, number>;

const ZERO: Counts = { parafuso: 0, porca: 0, arruela: 0, outro: 0 };

export function LiveCount({
  onFinish,
}: {
  onFinish: (c: { parafuso: number; porca: number; arruela: number }) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const detectorRef = useRef<LiveDetector | null>(null);
  const trackerRef = useRef<ObjectTracker>(new ObjectTracker());
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const noDetectFramesRef = useRef(0);

  const [alvo, setAlvo] = useState<Categoria>("parafuso");
  const alvoRef = useRef<Categoria>("parafuso");
  useEffect(() => { alvoRef.current = alvo; }, [alvo]);

  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState<Counts>(ZERO);
  const [avgScore, setAvgScore] = useState(0);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => () => stop(), []);

  async function start() {
    try {
      setLoading(true);
      setHint(null);
      trackerRef.current.reset();
      setCounts(ZERO);

      if (!detectorRef.current) detectorRef.current = createDefaultDetector();
      await detectorRef.current.load();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      runningRef.current = true;
      setRunning(true);
      noDetectFramesRef.current = 0;
      loop();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível abrir a câmera");
      stop();
    } finally {
      setLoading(false);
    }
  }

  function stop() {
    runningRef.current = false;
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }

  async function loop() {
    if (!runningRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const detector = detectorRef.current;
    if (!video || !canvas || !detector || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    try {
      const dets = await detector.detect(video);
      const alvoNow = alvoRef.current;
      const filtered: { bbox: { x: number; y: number; w: number; h: number }; categoria: Categoria; score: number }[] = [];
      for (const d of dets) {
        const cat = classifyDetection(d, alvoNow);
        if (cat) filtered.push({ bbox: d.bbox, categoria: cat, score: d.score });
      }

      const { ativos, novos } = trackerRef.current.update(
        filtered.map((f) => ({ bbox: f.bbox, categoria: f.categoria })),
      );

      if (novos.parafuso || novos.porca || novos.arruela || novos.outro) {
        setCounts((c) => ({
          parafuso: c.parafuso + novos.parafuso,
          porca: c.porca + novos.porca,
          arruela: c.arruela + novos.arruela,
          outro: c.outro + novos.outro,
        }));
      }

      if (filtered.length === 0) noDetectFramesRef.current++;
      else noDetectFramesRef.current = 0;
      if (noDetectFramesRef.current === 60) {
        setHint("Iluminação fraca ou câmera distante. Aproxime e melhore a luz.");
      } else if (filtered.length > 0 && hint) {
        setHint(null);
      }

      const avg = filtered.length
        ? filtered.reduce((s, x) => s + x.score, 0) / filtered.length
        : 0;
      setAvgScore(avg);

      // Desenha overlay
      const vw = video.videoWidth, vh = video.videoHeight;
      if (canvas.width !== vw) canvas.width = vw;
      if (canvas.height !== vh) canvas.height = vh;
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, vw, vh);
      ctx.lineWidth = Math.max(2, Math.round(vw / 320));
      ctx.font = `${Math.max(12, Math.round(vw / 60))}px ui-sans-serif, system-ui`;
      for (const t of ativos) {
        ctx.strokeStyle = t.counted ? "#22c55e" : "#facc15";
        ctx.strokeRect(t.bbox.x, t.bbox.y, t.bbox.w, t.bbox.h);
        const label = `#${t.id} ${t.categoria}`;
        ctx.fillStyle = "rgba(0,0,0,.6)";
        const m = ctx.measureText(label);
        ctx.fillRect(t.bbox.x, Math.max(0, t.bbox.y - 18), m.width + 8, 18);
        ctx.fillStyle = "#fff";
        ctx.fillText(label, t.bbox.x + 4, Math.max(12, t.bbox.y - 5));
      }
    } catch {
      // ignora frame com erro
    }
    rafRef.current = requestAnimationFrame(loop);
  }

  function finalizar() {
    const r = {
      parafuso: counts.parafuso + (alvo === "outro" ? counts.outro : 0),
      porca: counts.porca,
      arruela: counts.arruela,
    };
    // Encaminha conforme o alvo: "outro" vira parafuso por padrão? Não — só envia o alvo correspondente.
    const out = { parafuso: 0, porca: 0, arruela: 0 };
    if (alvo === "parafuso") out.parafuso = counts.parafuso;
    else if (alvo === "porca") out.porca = counts.porca;
    else if (alvo === "arruela") out.arruela = counts.arruela;
    else out.parafuso = counts.outro; // "outro" preenche o primeiro slot
    void r;
    stop();
    onFinish(out);
    toast.success(`Contagem ao vivo concluída: ${counts[alvo]} ${alvo}(s)`);
  }

  return (
    <div className="bg-card border border-border rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2"><Video className="size-4" /> Contagem ao Vivo (IA)</h3>
        {running && (
          <span className="text-xs text-muted-foreground">
            Confiança: {Math.round(avgScore * 100)}%
          </span>
        )}
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Item alvo</div>
        <div className="grid grid-cols-4 gap-1">
          {(["parafuso", "porca", "arruela", "outro"] as Categoria[]).map((c) => (
            <button
              key={c}
              onClick={() => setAlvo(c)}
              className={`py-2 rounded-md text-xs font-semibold capitalize border ${
                alvo === c ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
        <video ref={videoRef} playsInline muted className="w-full h-full object-contain" />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
        {!running && !loading && (
          <div className="absolute inset-0 flex items-center justify-center text-white/80 text-sm">
            Toque em Iniciar Contagem
          </div>
        )}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
            <Loader2 className="size-6 animate-spin mr-2" /> Carregando modelo…
          </div>
        )}
      </div>

      {hint && (
        <div className="text-xs bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 rounded-md px-2 py-1.5">
          {hint}
        </div>
      )}

      <div className="grid grid-cols-4 gap-1 text-center">
        {(["parafuso", "porca", "arruela", "outro"] as Categoria[]).map((c) => (
          <div key={c} className={`rounded-md py-1 ${alvo === c ? "bg-primary/15" : "bg-muted"}`}>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c}</div>
            <div className="text-lg font-bold">{counts[c]}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {!running ? (
          <button
            onClick={start}
            disabled={loading}
            className="col-span-2 bg-primary text-primary-foreground rounded-xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Play className="size-5" /> Iniciar Contagem
          </button>
        ) : (
          <>
            <button
              onClick={() => { trackerRef.current.reset(); setCounts(ZERO); toast.info("Contagem reiniciada"); }}
              className="bg-card border border-border rounded-xl py-3 font-semibold"
            >
              Reiniciar
            </button>
            <button
              onClick={finalizar}
              className="bg-accent text-accent-foreground rounded-xl py-3 font-semibold flex items-center justify-center gap-2"
            >
              <Square className="size-5" /> Concluir
            </button>
          </>
        )}
      </div>
    </div>
  );
}

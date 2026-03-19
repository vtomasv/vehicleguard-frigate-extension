import { useRef, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowRight, ArrowLeft, Trash2, Save, Info, CheckCircle2, Pencil } from "lucide-react";

export interface ArrowPoint {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface DirectionConfig {
  entry: ArrowPoint | null;
  exit: ArrowPoint | null;
  canvasWidth: number;
  canvasHeight: number;
}

interface Props {
  cameraId: number;
  cameraName: string;
  initialConfig?: DirectionConfig | null;
  onConfigSaved?: (config: DirectionConfig) => void;
}

type DrawingMode = "entry" | "exit" | null;

/**
 * Componente de configuración de flechas de dirección para cámaras.
 * Permite al operador dibujar dos flechas sobre un canvas:
 *  - Flecha VERDE: dirección de ENTRADA de vehículos
 *  - Flecha ROJA: dirección de SALIDA de vehículos
 */
export default function DirectionArrowConfig({ cameraId, cameraName, initialConfig, onConfigSaved }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [config, setConfig] = useState<DirectionConfig>(() => ({
    entry: initialConfig?.entry ?? null,
    exit: initialConfig?.exit ?? null,
    canvasWidth: initialConfig?.canvasWidth ?? 640,
    canvasHeight: initialConfig?.canvasHeight ?? 360,
  }));
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewEnd, setPreviewEnd] = useState<{ x: number; y: number } | null>(null);
  const [isSaved, setIsSaved] = useState(!!initialConfig?.entry || !!initialConfig?.exit);

  const updateDirectionConfig = trpc.cameras.updateDirectionConfig.useMutation({
    onSuccess: () => {
      toast.success("Configuración de flechas guardada correctamente");
      setIsSaved(true);
      onConfigSaved?.(config);
    },
    onError: (err) => {
      toast.error(`Error al guardar: ${err.message}`);
    },
  });

  // Draw everything on canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Center crosshair
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    // Instruction text
    if (!config.entry && !config.exit && !drawingMode) {
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "14px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Selecciona una flecha y dibuja en el canvas", W / 2, H / 2 - 10);
      ctx.font = "12px system-ui";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillText("Haz clic y arrastra para definir la dirección", W / 2, H / 2 + 14);
    }

    // Draw saved entry arrow (green)
    if (config.entry) {
      drawArrow(ctx, config.entry, "#22c55e", "ENTRADA", W, H);
    }

    // Draw saved exit arrow (red)
    if (config.exit) {
      drawArrow(ctx, config.exit, "#ef4444", "SALIDA", W, H);
    }

    // Draw preview arrow while dragging
    if (isDrawing && startPoint && previewEnd) {
      const color = drawingMode === "entry" ? "#22c55e" : "#ef4444";
      const label = drawingMode === "entry" ? "ENTRADA" : "SALIDA";
      drawArrow(ctx, {
        x1: startPoint.x, y1: startPoint.y,
        x2: previewEnd.x, y2: previewEnd.y,
      }, color, label, W, H, 0.6);
    }

    // Mode indicator
    if (drawingMode) {
      const color = drawingMode === "entry" ? "#22c55e" : "#ef4444";
      const label = drawingMode === "entry" ? "Dibujando flecha de ENTRADA" : "Dibujando flecha de SALIDA";
      ctx.fillStyle = color + "33";
      ctx.fillRect(0, 0, W, 32);
      ctx.fillStyle = color;
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(label + " — Haz clic y arrastra", W / 2, 21);
    }
  }, [config, drawingMode, isDrawing, startPoint, previewEnd]);

  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Update config when initialConfig changes
  useEffect(() => {
    if (initialConfig) {
      setConfig({
        entry: initialConfig.entry ?? null,
        exit: initialConfig.exit ?? null,
        canvasWidth: initialConfig.canvasWidth ?? 640,
        canvasHeight: initialConfig.canvasHeight ?? 360,
      });
      setIsSaved(true);
    }
  }, [initialConfig]);

  function getCanvasPoint(e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawingMode) return;
    const pt = getCanvasPoint(e);
    setStartPoint(pt);
    setPreviewEnd(pt);
    setIsDrawing(true);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawingMode) return;
    setPreviewEnd(getCanvasPoint(e));
  }

  function handleMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!isDrawing || !drawingMode || !startPoint) return;
    const end = getCanvasPoint(e);
    const canvas = canvasRef.current!;

    // Minimum arrow length: 30px
    const dx = end.x - startPoint.x;
    const dy = end.y - startPoint.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 30) {
      toast.warning("La flecha es muy corta. Arrastra más para definir la dirección.");
      setIsDrawing(false);
      setStartPoint(null);
      setPreviewEnd(null);
      return;
    }

    const arrow: ArrowPoint = { x1: startPoint.x, y1: startPoint.y, x2: end.x, y2: end.y };
    setConfig((prev) => ({
      ...prev,
      [drawingMode]: arrow,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    }));
    setIsDrawing(false);
    setStartPoint(null);
    setPreviewEnd(null);
    setDrawingMode(null);
    setIsSaved(false);
    toast.success(`Flecha de ${drawingMode === "entry" ? "ENTRADA" : "SALIDA"} configurada. Guarda los cambios.`);
  }

  function handleMouseLeave() {
    if (isDrawing) {
      setIsDrawing(false);
      setStartPoint(null);
      setPreviewEnd(null);
    }
  }

  function clearArrow(type: "entry" | "exit") {
    setConfig((prev) => ({ ...prev, [type]: null }));
    setIsSaved(false);
  }

  function handleSave() {
    const canvas = canvasRef.current;
    const finalConfig: DirectionConfig = {
      ...config,
      canvasWidth: canvas?.width ?? 640,
      canvasHeight: canvas?.height ?? 360,
    };
    updateDirectionConfig.mutate({ cameraId, config: finalConfig });
  }

  const hasConfig = config.entry || config.exit;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Configurar Flechas de Dirección</span>
          {isSaved && hasConfig && (
            <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Configurado
            </Badge>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-300 leading-relaxed">
          Dibuja las flechas para indicar la dirección de movimiento de los vehículos en esta cámara.
          La <span className="text-green-400 font-medium">flecha verde</span> indica la dirección de <strong>ENTRADA</strong> y
          la <span className="text-red-400 font-medium">flecha roja</span> indica la dirección de <strong>SALIDA</strong>.
          Esta configuración se usará como contexto para el análisis de IA.
        </p>
      </div>

      {/* Tool selector */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={drawingMode === "entry" ? "default" : "outline"}
          className={`flex-1 h-9 text-xs gap-1.5 ${drawingMode === "entry" ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : "border-green-500/40 text-green-400 hover:bg-green-500/10"}`}
          onClick={() => setDrawingMode(drawingMode === "entry" ? null : "entry")}
        >
          <ArrowRight className="w-3.5 h-3.5" />
          {config.entry ? "Redibujar Entrada" : "Dibujar Entrada"}
          {config.entry && <CheckCircle2 className="w-3 h-3 ml-auto" />}
        </Button>
        <Button
          size="sm"
          variant={drawingMode === "exit" ? "default" : "outline"}
          className={`flex-1 h-9 text-xs gap-1.5 ${drawingMode === "exit" ? "bg-red-600 hover:bg-red-700 text-white border-red-600" : "border-red-500/40 text-red-400 hover:bg-red-500/10"}`}
          onClick={() => setDrawingMode(drawingMode === "exit" ? null : "exit")}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {config.exit ? "Redibujar Salida" : "Dibujar Salida"}
          {config.exit && <CheckCircle2 className="w-3 h-3 ml-auto" />}
        </Button>
      </div>

      {/* Canvas */}
      <div className="relative rounded-lg overflow-hidden border-2 border-border"
        style={{ borderColor: drawingMode === "entry" ? "#22c55e55" : drawingMode === "exit" ? "#ef444455" : undefined }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="w-full block"
          style={{ cursor: drawingMode ? "crosshair" : "default" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </div>

      {/* Arrow status + clear buttons */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`flex items-center justify-between p-2.5 rounded-lg border ${config.entry ? "bg-green-500/10 border-green-500/30" : "bg-secondary border-border"}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${config.entry ? "bg-green-400" : "bg-muted-foreground"}`} />
            <span className="text-xs font-medium text-foreground">Flecha Entrada</span>
          </div>
          {config.entry ? (
            <button onClick={() => clearArrow("entry")} className="text-muted-foreground hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Sin configurar</span>
          )}
        </div>
        <div className={`flex items-center justify-between p-2.5 rounded-lg border ${config.exit ? "bg-red-500/10 border-red-500/30" : "bg-secondary border-border"}`}>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${config.exit ? "bg-red-400" : "bg-muted-foreground"}`} />
            <span className="text-xs font-medium text-foreground">Flecha Salida</span>
          </div>
          {config.exit ? (
            <button onClick={() => clearArrow("exit")} className="text-muted-foreground hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">Sin configurar</span>
          )}
        </div>
      </div>

      {/* Save button */}
      <Button
        className="w-full h-9 text-sm gap-2"
        onClick={handleSave}
        disabled={!hasConfig || updateDirectionConfig.isPending || isSaved}
      >
        <Save className="w-4 h-4" />
        {updateDirectionConfig.isPending ? "Guardando..." : isSaved ? "Configuración guardada" : "Guardar configuración de flechas"}
      </Button>
    </div>
  );
}

// ─── Canvas drawing helpers ───────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  arrow: ArrowPoint,
  color: string,
  label: string,
  _W: number,
  _H: number,
  alpha = 1
) {
  const { x1, y1, x2, y2 } = arrow;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const angle = Math.atan2(dy, dx);
  const headLen = Math.min(24, len * 0.35);

  ctx.save();
  ctx.globalAlpha = alpha;

  // Shadow glow
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;

  // Line
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  // Arrowhead
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLen * Math.cos(angle - Math.PI / 6),
    y2 - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x2 - headLen * Math.cos(angle + Math.PI / 6),
    y2 - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  // Start circle
  ctx.beginPath();
  ctx.arc(x1, y1, 5, 0, Math.PI * 2);
  ctx.fill();

  // Label background
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const perpX = -dy / len * 18;
  const perpY = dx / len * 18;
  const lx = midX + perpX;
  const ly = midY + perpY;

  ctx.shadowBlur = 0;
  ctx.font = "bold 11px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textW = ctx.measureText(label).width + 12;
  ctx.fillStyle = color + "cc";
  ctx.beginPath();
  ctx.roundRect(lx - textW / 2, ly - 10, textW, 20, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, lx, ly);

  ctx.restore();
}

import { useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import AccessControlLayout from "@/components/AccessControlLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Brain,
  Camera,
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Image,
  Layers,
  TrendingDown,
  TrendingUp,
  Zap,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

// ─── Types matching server FrameAnalysisStep ──────────────────────────────────

type FrameStep = {
  frameIndex: number;
  frameUrl: string;
  annotatedFrameUrl?: string;
  timestamp: number;
  presenceDetected: boolean;
  vehicleDescription: string;
  segmentId?: number | null;
  llmRawResponse?: unknown;
  directionDetected?: string | null;
  matchedArrow?: "entry" | "exit" | "none" | null;
  angularScore?: number | null;
  decision?: string | null;
  reasoning?: string | null;
};

type AnalysisReport = {
  id: number;
  accessEventId: number;
  videoUploadId: number;
  cameraId: number;
  summary: string | null;
  totalFramesAnalyzed: number;
  segmentsDetected: number;
  finalDecision: string | null;
  decisionReasoning: string | null;
  frameSteps: FrameStep[] | null;
  annotatedFrameUrls: string[] | null;
  directionConfigSnapshot: {
    entryArrow: { x1: number; y1: number; x2: number; y2: number } | null;
    exitArrow: { x1: number; y1: number; x2: number; y2: number } | null;
  } | null;
  promptSnapshot: string | null;
  processingTimeMs: number | null;
  llmCallCount: number;
  createdAt: Date | string;
};

// ─── Helper components ────────────────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: string | null | undefined }) {
  if (!direction) return <Badge variant="outline" className="text-xs">Desconocida</Badge>;
  const map: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
    right: { label: "Derecha", icon: ArrowRight, cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    left: { label: "Izquierda", icon: ArrowLeft, cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    forward: { label: "Al fondo", icon: ArrowUp, cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
    backward: { label: "Hacia cámara", icon: ArrowDown, cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
    "forward-left": { label: "Fondo-Izq", icon: ArrowUp, cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    "forward-right": { label: "Fondo-Der", icon: ArrowUp, cls: "bg-green-500/15 text-green-400 border-green-500/30" },
    "backward-left": { label: "Cámara-Izq", icon: ArrowDown, cls: "bg-red-500/15 text-red-400 border-red-500/30" },
    "backward-right": { label: "Cámara-Der", icon: ArrowDown, cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  };
  const d = map[direction] || { label: direction, icon: ArrowRight, cls: "bg-gray-500/15 text-gray-400" };
  const Icon = d.icon;
  return (
    <Badge className={`text-xs gap-1 ${d.cls}`}>
      <Icon className="w-3 h-3" />
      {d.label}
    </Badge>
  );
}

function EventBadge({ eventType }: { eventType: string | null | undefined }) {
  if (eventType === "entry") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs gap-1"><TrendingUp className="w-3 h-3" />ENTRADA</Badge>;
  if (eventType === "exit") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs gap-1"><TrendingDown className="w-3 h-3" />SALIDA</Badge>;
  return <Badge className="bg-gray-500/15 text-gray-400 text-xs">DESCONOCIDO</Badge>;
}

function ArrowMatchBadge({ matchedArrow }: { matchedArrow: string | null | undefined }) {
  if (matchedArrow === "entry") return <Badge className="bg-green-500/15 text-green-400 border-green-500/30 text-xs gap-1"><CheckCircle className="w-3 h-3" />Flecha entrada</Badge>;
  if (matchedArrow === "exit") return <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-xs gap-1"><TrendingDown className="w-3 h-3" />Flecha salida</Badge>;
  if (matchedArrow === "none") return <Badge variant="outline" className="text-xs text-muted-foreground">Sin coincidencia</Badge>;
  return null;
}

function FrameStepCard({ step, index }: { step: FrameStep; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`bg-card border-border ${step.presenceDetected ? "border-l-2 border-l-primary" : "opacity-60"}`}>
      <CardHeader
        className="pb-2 pt-3 px-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${step.presenceDetected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {index + 1}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-foreground">
                  Frame #{step.frameIndex + 1}
                </span>
                {step.presenceDetected ? (
                  <Badge className="text-xs bg-primary/15 text-primary border-primary/30">
                    Vehículo detectado
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Sin vehículo
                  </Badge>
                )}
                {step.segmentId !== undefined && step.segmentId !== null && (
                  <Badge variant="outline" className="text-xs font-mono">
                    Seg. {step.segmentId + 1}
                  </Badge>
                )}
              </div>
              {step.presenceDetected && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">{step.vehicleDescription}</span>
                  {step.directionDetected && <DirectionBadge direction={step.directionDetected} />}
                  <ArrowMatchBadge matchedArrow={step.matchedArrow} />
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step.decision && <EventBadge eventType={step.decision} />}
            {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4">
          <div className="grid grid-cols-2 gap-4 mt-2">
            {/* Frame images */}
            <div className="space-y-2">
              {step.frameUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium">Frame original</p>
                  <img
                    src={step.frameUrl}
                    alt={`Frame ${step.frameIndex + 1}`}
                    className="w-full rounded-md border border-border object-cover max-h-48"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              {step.annotatedFrameUrl && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1 font-medium flex items-center gap-1">
                    <Eye className="w-3 h-3 text-primary" />
                    Frame anotado con flechas de dirección
                  </p>
                  <img
                    src={step.annotatedFrameUrl}
                    alt={`Frame ${step.frameIndex + 1} anotado`}
                    className="w-full rounded-md border border-primary/30 object-cover max-h-48"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
            </div>

            {/* Analysis details */}
            <div className="space-y-3">
              {/* Presence reasoning */}
              {step.reasoning && (
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Brain className="w-3 h-3 text-primary" />
                    Razonamiento del agente
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">{step.reasoning}</p>
                </div>
              )}

              {/* Direction info */}
              {step.presenceDetected && (
                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-primary" />
                    Análisis de dirección
                  </p>
                  <div className="space-y-1.5">
                    {step.directionDetected && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Dirección detectada</span>
                        <DirectionBadge direction={step.directionDetected} />
                      </div>
                    )}
                    {step.matchedArrow && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Flecha coincidente</span>
                        <ArrowMatchBadge matchedArrow={step.matchedArrow} />
                      </div>
                    )}
                    {step.angularScore !== undefined && step.angularScore !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Puntuación angular</span>
                        <span className="text-xs font-mono text-foreground">{step.angularScore.toFixed(3)}</span>
                      </div>
                    )}
                    {step.decision && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Decisión final</span>
                        <EventBadge eventType={step.decision} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AnalysisReportPage() {
  const [, params] = useRoute("/reports/:eventId");
  const eventId = params?.eventId ? parseInt(params.eventId) : null;
  const [showPrompt, setShowPrompt] = useState(false);

  const { data: report, isLoading, error } = trpc.reports.getByEventId.useQuery(
    { eventId: eventId! },
    { enabled: !!eventId }
  );

  const typedReport = report as AnalysisReport | null | undefined;

  if (!eventId) {
    return (
      <AccessControlLayout title="Reporte de Análisis">
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm text-foreground">ID de evento inválido</p>
          <Link href="/records">
            <Button variant="outline" size="sm" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a Registros
            </Button>
          </Link>
        </div>
      </AccessControlLayout>
    );
  }

  if (isLoading) {
    return (
      <AccessControlLayout title="Reporte de Análisis">
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="ml-3 text-sm text-muted-foreground">Cargando reporte de análisis...</span>
        </div>
      </AccessControlLayout>
    );
  }

  if (error || !typedReport) {
    return (
      <AccessControlLayout title="Reporte de Análisis">
        <div className="flex flex-col items-center justify-center py-16">
          <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground">Reporte no disponible</p>
          <p className="text-xs text-muted-foreground mt-1">
            Este evento no fue procesado con el modo de análisis detallado activado.
          </p>
          <Link href="/records">
            <Button variant="outline" size="sm" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver a Registros
            </Button>
          </Link>
        </div>
      </AccessControlLayout>
    );
  }

  const frameSteps = (typedReport.frameSteps || []) as FrameStep[];
  const detectedFrames = frameSteps.filter((f) => f.presenceDetected);
  const emptyFrames = frameSteps.filter((f) => !f.presenceDetected);

  return (
    <AccessControlLayout title={`Reporte Detallado — Evento #${eventId}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/records">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                  <ArrowLeft className="w-3 h-3" />
                  Registros
                </Button>
              </Link>
              <h2 className="text-xl font-bold text-foreground">Reporte de Análisis Detallado</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Evento #{eventId} · Generado el {new Date(typedReport.createdAt).toLocaleString("es-AR")}
            </p>
          </div>
          <EventBadge eventType={typedReport.finalDecision} />
        </div>

        {/* Executive summary cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Frames analizados</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{typedReport.totalFramesAnalyzed}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {detectedFrames.length} con vehículo · {emptyFrames.length} vacíos
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Camera className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Segmentos</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{typedReport.segmentsDetected}</p>
              <p className="text-xs text-muted-foreground mt-0.5">vehículos detectados</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Llamadas LLM</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{typedReport.llmCallCount}</p>
              <p className="text-xs text-muted-foreground mt-0.5">al modelo de visión</p>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Tiempo total</span>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {typedReport.processingTimeMs ? `${(typedReport.processingTimeMs / 1000).toFixed(1)}s` : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">de procesamiento</p>
            </CardContent>
          </Card>
        </div>

        {/* Summary */}
        {typedReport.summary && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Resumen Ejecutivo
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-sm text-foreground leading-relaxed">{typedReport.summary}</p>
              {typedReport.decisionReasoning && (
                <div className="mt-3 p-3 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Brain className="w-3 h-3 text-primary" />
                    Razonamiento de la decisión final
                  </p>
                  <p className="text-xs text-foreground leading-relaxed">{typedReport.decisionReasoning}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Direction config snapshot */}
        {typedReport.directionConfigSnapshot && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ArrowUp className="w-4 h-4 text-primary" />
                Configuración de Flechas Usada
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-4">
                {typedReport.directionConfigSnapshot.entryArrow && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-xs font-semibold text-green-400 mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      Flecha de Entrada
                    </p>
                    <p className="text-xs font-mono text-foreground">
                      ({typedReport.directionConfigSnapshot.entryArrow.x1.toFixed(0)}, {typedReport.directionConfigSnapshot.entryArrow.y1.toFixed(0)}) →
                      ({typedReport.directionConfigSnapshot.entryArrow.x2.toFixed(0)}, {typedReport.directionConfigSnapshot.entryArrow.y2.toFixed(0)})
                    </p>
                  </div>
                )}
                {typedReport.directionConfigSnapshot.exitArrow && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs font-semibold text-red-400 mb-1 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3" />
                      Flecha de Salida
                    </p>
                    <p className="text-xs font-mono text-foreground">
                      ({typedReport.directionConfigSnapshot.exitArrow.x1.toFixed(0)}, {typedReport.directionConfigSnapshot.exitArrow.y1.toFixed(0)}) →
                      ({typedReport.directionConfigSnapshot.exitArrow.x2.toFixed(0)}, {typedReport.directionConfigSnapshot.exitArrow.y2.toFixed(0)})
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Frame-by-frame analysis */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Análisis Frame a Frame</h3>
            <Badge variant="outline" className="text-xs">{frameSteps.length} frames</Badge>
          </div>
          <div className="space-y-2">
            {frameSteps.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle className="w-8 h-8 text-muted-foreground mb-3" />
                <p className="text-sm text-foreground">No hay datos de frames disponibles</p>
                <p className="text-xs text-muted-foreground mt-1">El reporte no contiene pasos de análisis por frame</p>
              </div>
            ) : (
              frameSteps.map((step, idx) => (
                <FrameStepCard key={step.frameIndex} step={step} index={idx} />
              ))
            )}
          </div>
        </div>

        {/* Annotated frames gallery */}
        {typedReport.annotatedFrameUrls && typedReport.annotatedFrameUrls.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Image className="w-4 h-4 text-primary" />
                Galería de Frames Anotados con Flechas de Dirección
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-3 gap-3">
                {typedReport.annotatedFrameUrls.map((url, idx) => (
                  <div key={idx} className="rounded-lg overflow-hidden border border-border">
                    <img
                      src={url}
                      alt={`Frame anotado ${idx + 1}`}
                      className="w-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="px-2 py-1 bg-secondary">
                      <span className="text-xs text-muted-foreground">Frame {idx + 1}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prompt used */}
        {typedReport.promptSnapshot && (
          <Card className="bg-card border-border">
            <CardHeader
              className="pb-2 pt-4 px-4 cursor-pointer"
              onClick={() => setShowPrompt(!showPrompt)}
            >
              <CardTitle className="text-sm font-semibold text-foreground flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-primary" />
                  Prompt Enviado al Agente LLM
                </div>
                {showPrompt ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            {showPrompt && (
              <CardContent className="px-4 pb-4">
                <pre className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono bg-secondary p-4 rounded-lg border border-border overflow-x-auto max-h-96 overflow-y-auto">
                  {typedReport.promptSnapshot}
                </pre>
              </CardContent>
            )}
          </Card>
        )}

        {/* Footer timing info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pb-6">
          <Clock className="w-3 h-3" />
          <span>Análisis completado en {typedReport.processingTimeMs ? `${(typedReport.processingTimeMs / 1000).toFixed(2)}s` : "—"}</span>
          <span>·</span>
          <span>{typedReport.llmCallCount} llamadas al modelo de visión</span>
          <span>·</span>
          <span>Reporte ID: {typedReport.id}</span>
        </div>
      </div>
    </AccessControlLayout>
  );
}

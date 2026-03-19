import AccessControlLayout from "@/components/AccessControlLayout";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useCallback } from "react";
import {
  Camera,
  Upload,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  Car,
  Users,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Film,
  Settings2,
  Video,
  Microscope,
  FileText,
  Brain,
  RotateCcw,
  Save,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import DirectionArrowConfig, { type DirectionConfig } from "@/components/DirectionArrowConfig";

interface ProcessingResult {
  eventType: string;
  vehicleType: string;
  description: string;
  confidence: number;
  uniquePersonCount: number;
  framesAnalyzed: number;
  eventsCreated?: number;
  hasDetailedReport?: boolean;
}

interface CameraCardProps {
  cameraId: number;
  cameraName: string;
  cameraType: "trucks" | "vehicles";
  location: string;
  directionConfig?: DirectionConfig | null;
  customSystemPrompt?: string | null;
  customUserPrompt?: string | null;
}

function extractFramesFromVideo(
  videoFile: File,
  targetFrameCount: number = 12
): Promise<Array<{ base64: string; timestampSeconds: number }>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    const frames: Array<{ base64: string; timestampSeconds: number }> = [];

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(videoFile);
    video.src = objectUrl;

    video.onloadedmetadata = () => {
      const duration = video.duration;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;

      const timestamps: number[] = [];
      for (let i = 0; i < targetFrameCount; i++) {
        const t = (duration / (targetFrameCount + 1)) * (i + 1);
        timestamps.push(Math.min(t, duration - 0.1));
      }

      let idx = 0;
      const captureNext = () => {
        if (idx >= timestamps.length) {
          URL.revokeObjectURL(objectUrl);
          resolve(frames);
          return;
        }
        video.currentTime = timestamps[idx];
      };

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
        frames.push({ base64, timestampSeconds: timestamps[idx] });
        idx++;
        captureNext();
      };

      captureNext();
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo cargar el video para extracción de fotogramas"));
    };
  });
}

// ── Prompt Editor Component ──────────────────────────────────────────────────

function PromptEditor({ cameraId, cameraName, cameraType, initialSystemPrompt, initialUserPrompt }: {
  cameraId: number;
  cameraName: string;
  cameraType: "trucks" | "vehicles";
  initialSystemPrompt?: string | null;
  initialUserPrompt?: string | null;
}) {
  const [systemPrompt, setSystemPrompt] = useState(initialSystemPrompt ?? "");
  const [userPrompt, setUserPrompt] = useState(initialUserPrompt ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const updatePromptsMutation = trpc.cameras.updatePrompts.useMutation();
  const utils = trpc.useUtils();

  const defaultSystemPrompt = cameraType === "trucks"
    ? `Eres un sistema experto de control de acceso vehicular especializado en identificación de camiones pesados. Analiza imágenes de cámaras de seguridad con máxima precisión forense. Tu objetivo es identificar cada camión de forma unívoca y determinar si está entrando o saliendo del predio.`
    : `Eres un sistema experto de control de acceso vehicular especializado en identificación de vehículos livianos y personas. Analiza imágenes de cámaras de seguridad con máxima precisión forense. Tu objetivo es identificar cada vehículo o persona de forma unívoca y determinar si está entrando o saliendo del predio.`;

  const defaultUserPrompt = cameraType === "trucks"
    ? `Analiza esta imagen de cámara de seguridad y proporciona un análisis detallado del camión visible. Identifica: marca, modelo, color, matrícula, estado de la carrocería, si lleva carga, tipo de carga, número de ejes, presencia de remolque, empresa propietaria, y cualquier característica distintiva. Determina la dirección de movimiento del vehículo.`
    : `Analiza esta imagen de cámara de seguridad y proporciona un análisis detallado del vehículo o persona visible. Para vehículos: identifica marca, modelo, color, matrícula, estado, y características distintivas. Para personas: describe vestimenta, complexión y características identificables. Determina la dirección de movimiento.`;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePromptsMutation.mutateAsync({
        cameraId,
        customSystemPrompt: systemPrompt.trim() || null,
        customUserPrompt: userPrompt.trim() || null,
      });
      await utils.cameras.list.invalidate();
      toast.success("Prompts guardados correctamente");
    } catch (err) {
      toast.error("Error al guardar los prompts");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSystemPrompt("");
    setUserPrompt("");
    toast.info("Prompts restablecidos a valores predeterminados");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
        <Brain className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-300">
          <p className="font-medium mb-1">Editor de Prompts del Agente IA</p>
          <p className="text-blue-300/70">
            Personaliza las instrucciones del modelo de visión para esta cámara. Si los campos están vacíos, se usan los prompts predeterminados optimizados para {cameraType === "trucks" ? "camiones" : "vehículos y personas"}.
          </p>
        </div>
      </div>

      {/* System Prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Brain className="w-3.5 h-3.5 text-primary" />
            Prompt de Sistema (Rol del Agente)
          </Label>
          <button
            onClick={() => setSystemPrompt(defaultSystemPrompt)}
            className="text-xs text-primary/70 hover:text-primary transition-colors"
          >
            Ver predeterminado
          </button>
        </div>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={defaultSystemPrompt}
          className="min-h-[100px] text-xs font-mono bg-secondary border-border resize-y"
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          Define el rol y especialización del agente IA. Vacío = usa el predeterminado.
        </p>
      </div>

      {/* User Prompt */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-primary" />
            Prompt de Usuario (Instrucciones de Análisis)
          </Label>
          <button
            onClick={() => setUserPrompt(defaultUserPrompt)}
            className="text-xs text-primary/70 hover:text-primary transition-colors"
          >
            Ver predeterminado
          </button>
        </div>
        <Textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          placeholder={defaultUserPrompt}
          className="min-h-[120px] text-xs font-mono bg-secondary border-border resize-y"
          rows={5}
        />
        <p className="text-xs text-muted-foreground">
          Instrucciones específicas de qué analizar en cada frame. Vacío = usa el predeterminado.
        </p>
      </div>

      {/* Skill info */}
      <div className="p-3 rounded-lg bg-secondary border border-border space-y-2">
        <p className="text-xs font-semibold text-foreground">Capacidades del Agente</p>
        <div className="grid grid-cols-2 gap-1.5 text-xs text-muted-foreground">
          {(cameraType === "trucks" ? [
            "Identificación de marca y modelo",
            "Detección de carga y tipo",
            "Conteo de ejes y remolque",
            "Reconocimiento de empresa/logo",
            "Estado de carrocería y daños",
            "Estimación de año del vehículo",
          ] : [
            "Identificación de marca y modelo",
            "Detección de color y matrícula",
            "Conteo único de personas",
            "Descripción de vestimenta",
            "Estado del vehículo",
            "Características distintivas",
          ]).map((cap) => (
            <div key={cap} className="flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
              <span>{cap}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={handleReset}
          disabled={isSaving}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Restablecer
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-2"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isSaving ? "Guardando..." : "Guardar Prompts"}
        </Button>
      </div>
    </div>
  );
}

// ── Camera Card Component ────────────────────────────────────────────────────

function CameraCard({
  cameraId,
  cameraName,
  cameraType,
  location,
  directionConfig: initialDirectionConfig,
  customSystemPrompt: initialSystemPrompt,
  customUserPrompt: initialUserPrompt,
}: CameraCardProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingStep, setProcessingStep] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<ProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailedMode, setDetailedMode] = useState(false);
  const [savedDirectionConfig, setSavedDirectionConfig] = useState<DirectionConfig | null>(
    initialDirectionConfig ?? null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadMutation = trpc.video.upload.useMutation();
  const processMutation = trpc.video.processVideo.useMutation();
  const { data: uploads, refetch: refetchUploads } = trpc.video.getByCamera.useQuery({ cameraId });

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("Por favor selecciona un archivo de video válido");
      return;
    }
    if (file.size > 200 * 1024 * 1024) {
      toast.error("El archivo no puede superar 200MB");
      return;
    }
    setVideoFile(file);
    setVideoUrl(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("video/")) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      setResult(null);
      setError(null);
    }
  }, []);

  const handleProcess = async () => {
    if (!videoFile) return;

    if (!savedDirectionConfig?.entry && !savedDirectionConfig?.exit) {
      toast.warning(
        "Las flechas de dirección no están configuradas. El análisis usará la regla predeterminada (derecha=entrada, izquierda=salida).",
        { duration: 5000 }
      );
    }

    setIsProcessing(true);
    setError(null);
    setResult(null);
    setUploadProgress(0);

    try {
      setProcessingStep("Preparando video...");
      setUploadProgress(10);

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(videoFile);
      });

      setProcessingStep("Subiendo video a almacenamiento seguro...");
      setUploadProgress(25);

      const uploadResult = await uploadMutation.mutateAsync({
        cameraId,
        filename: videoFile.name,
        base64Data,
        mimeType: videoFile.type,
        fileSize: videoFile.size,
      });

      setUploadProgress(45);

      setProcessingStep("Extrayendo fotogramas clave para análisis...");
      const frames = await extractFramesFromVideo(videoFile, 12);
      setUploadProgress(60);

      const duration = await new Promise<number>((resolve) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.src = URL.createObjectURL(videoFile);
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => resolve(0);
      });

      setProcessingStep(
        detailedMode
          ? "Analizando con IA (modo detallado — esto puede tardar más)..."
          : "Analizando con inteligencia artificial..."
      );
      setUploadProgress(75);

      const processResult = await processMutation.mutateAsync({
        uploadId: uploadResult.uploadId,
        frames,
        durationSeconds: duration,
        detailedMode,
      });

      setUploadProgress(100);
      setResult({ ...processResult, hasDetailedReport: detailedMode && (processResult.eventsCreated ?? 0) > 0 });
      setProcessingStep("");
      toast.success(
        detailedMode
          ? `Video procesado con análisis detallado. ${processResult.eventsCreated ?? 1} evento(s) registrado(s).`
          : "Video procesado correctamente"
      );
      refetchUploads();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setError(msg);
      setProcessingStep("");
      toast.error(`Error al procesar: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const statusColor: Record<string, string> = {
    pending: "bg-gray-500/15 text-gray-400 border-gray-500/30",
    processing: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    completed: "bg-green-500/15 text-green-400 border-green-500/30",
    error: "bg-red-500/15 text-red-400 border-red-500/30",
  };

  const statusLabel: Record<string, string> = {
    pending: "Pendiente",
    processing: "Procesando",
    completed: "Completado",
    error: "Error",
  };

  const hasDirectionConfig = savedDirectionConfig?.entry || savedDirectionConfig?.exit;

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary live-indicator" />
            {cameraName}
          </CardTitle>
          <div className="flex items-center gap-2">
            {hasDirectionConfig && (
              <Badge className="text-xs bg-green-500/15 text-green-400 border-green-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Flechas OK
              </Badge>
            )}
            <Badge className="text-xs bg-primary/15 text-primary border-primary/25">
              {cameraType === "trucks" ? "Camiones" : "Vehículos/Personas"}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{location}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        <Tabs defaultValue="camera" className="w-full">
          <TabsList className="w-full h-8 bg-secondary grid grid-cols-3">
            <TabsTrigger value="camera" className="text-xs gap-1 h-7">
              <Video className="w-3.5 h-3.5" />
              Cámara
            </TabsTrigger>
            <TabsTrigger value="config" className="text-xs gap-1 h-7">
              <Settings2 className="w-3.5 h-3.5" />
              Flechas
              {!hasDirectionConfig && (
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 ml-0.5" />
              )}
            </TabsTrigger>
            <TabsTrigger value="prompts" className="text-xs gap-1 h-7">
              <Brain className="w-3.5 h-3.5" />
              Prompts
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Cámara ── */}
          <TabsContent value="camera" className="mt-4 space-y-4">
            {!hasDirectionConfig && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                <p className="text-xs text-yellow-300">
                  <span className="font-medium">Flechas de dirección no configuradas.</span>{" "}
                  Ve a la pestaña "Flechas" para indicar la dirección de entrada y salida antes de analizar.
                </p>
              </div>
            )}

            {/* Camera feed / video preview */}
            <div
              className="camera-feed rounded-lg aspect-video flex items-center justify-center cursor-pointer"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !videoUrl && fileInputRef.current?.click()}
            >
              {videoUrl ? (
                <video
                  src={videoUrl}
                  controls
                  className="w-full h-full object-contain rounded-lg"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center p-6">
                  <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Camera className="w-6 h-6 text-primary/60" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Sin señal</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Arrastra un video o haz clic para simular transmisión
                    </p>
                  </div>
                  <div className="scanline" />
                </div>
              )}
            </div>

            {/* Detailed Mode Switch */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-secondary border border-border">
              <div className="flex items-center gap-2">
                <Microscope className={`w-4 h-4 ${detailedMode ? "text-purple-400" : "text-muted-foreground"}`} />
                <div>
                  <Label htmlFor={`detailed-${cameraId}`} className="text-xs font-medium text-foreground cursor-pointer">
                    Análisis Detallado
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {detailedMode
                      ? "Genera reporte forense completo frame a frame con flechas anotadas"
                      : "Activa para generar reporte forense completo con explicación de decisiones"}
                  </p>
                </div>
              </div>
              <Switch
                id={`detailed-${cameraId}`}
                checked={detailedMode}
                onCheckedChange={setDetailedMode}
                className="data-[state=checked]:bg-purple-500"
              />
            </div>

            {detailedMode && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Microscope className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
                <div className="text-xs text-purple-300 space-y-1">
                  <p className="font-medium">Modo Análisis Detallado Activado</p>
                  <ul className="text-purple-300/80 space-y-0.5 list-disc list-inside">
                    <li>Reporte frame a frame con decisiones del agente</li>
                    <li>Flechas de dirección superpuestas en cada fotograma</li>
                    <li>Explicación del razonamiento de cada detección</li>
                    <li>Disponible en "Ver Análisis" en la planilla de registros</li>
                  </ul>
                  <p className="text-purple-400/70 mt-1">⚠ El procesamiento tardará más tiempo</p>
                </div>
              </div>
            )}

            {/* Upload controls */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <Upload className="w-4 h-4" />
                {videoFile ? "Cambiar video" : "Cargar video"}
              </Button>
              {videoFile && (
                <Button
                  size="sm"
                  className={`flex-1 gap-2 ${detailedMode ? "bg-purple-600 hover:bg-purple-700" : ""}`}
                  onClick={handleProcess}
                  disabled={isProcessing}
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : detailedMode ? (
                    <Microscope className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {isProcessing ? "Procesando..." : detailedMode ? "Analizar (Detallado)" : "Analizar"}
                </Button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileSelect}
            />

            {/* Processing progress */}
            {isProcessing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{processingStep}</span>
                  <span className="text-xs text-primary font-mono">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className={`h-1.5 ${detailedMode ? "[&>div]:bg-purple-500" : ""}`} />
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive">{error}</p>
              </div>
            )}

            {/* Analysis result */}
            {result && (
              <div className="space-y-3 p-4 rounded-lg bg-secondary border border-border">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                  <span className="text-sm font-semibold text-foreground">Análisis Completado</span>
                  {result.hasDetailedReport && (
                    <Badge className="text-xs bg-purple-500/15 text-purple-400 border-purple-500/30">
                      <Microscope className="w-3 h-3 mr-1" />
                      Reporte detallado
                    </Badge>
                  )}
                  {(result.eventsCreated ?? 1) > 1 ? (
                    <Badge className="ml-auto text-xs bg-blue-500/15 text-blue-400 border-blue-500/30">
                      {result.eventsCreated} vehículos detectados
                    </Badge>
                  ) : (
                    <Badge className={`ml-auto text-xs ${result.eventType === "entry" ? "bg-green-500/15 text-green-400 border-green-500/30" : result.eventType === "exit" ? "bg-red-500/15 text-red-400 border-red-500/30" : "bg-gray-500/15 text-gray-400 border-gray-500/30"}`}>
                      {result.eventType === "entry" ? (
                        <><TrendingUp className="w-3 h-3 mr-1" />ENTRADA</>
                      ) : result.eventType === "exit" ? (
                        <><TrendingDown className="w-3 h-3 mr-1" />SALIDA</>
                      ) : "DESCONOCIDO"}
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {result.vehicleType === "truck" ? <Truck className="w-3.5 h-3.5 text-yellow-400" /> :
                     result.vehicleType === "person" ? <Users className="w-3.5 h-3.5 text-blue-400" /> :
                     <Car className="w-3.5 h-3.5 text-blue-400" />}
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="text-foreground font-medium capitalize">
                      {result.vehicleType === "truck" ? "Camión" :
                       result.vehicleType === "car" ? "Auto" :
                       result.vehicleType === "van" ? "Camioneta" :
                       result.vehicleType === "motorcycle" ? "Moto" :
                       result.vehicleType === "person" ? "Persona" : result.vehicleType}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Confianza:</span>
                    <span className="text-foreground font-medium">
                      {Math.round(result.confidence * 100)}%
                    </span>
                  </div>
                  {cameraType === "vehicles" && result.uniquePersonCount > 0 && (
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Users className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-muted-foreground">Personas únicas:</span>
                      <span className="text-foreground font-medium">{result.uniquePersonCount}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Film className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Fotogramas:</span>
                    <span className="text-foreground font-medium">{result.framesAnalyzed}</span>
                  </div>
                  {(result.eventsCreated ?? 0) > 0 && (
                    <div className="flex items-center gap-1.5 col-span-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                      <span className="text-muted-foreground">Registros creados:</span>
                      <span className="text-green-400 font-medium">{result.eventsCreated} evento{(result.eventsCreated ?? 0) > 1 ? "s" : ""}</span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground font-medium mb-1">Descripción IA:</p>
                  <p className="text-xs text-foreground leading-relaxed line-clamp-5">
                    {result.description}
                  </p>
                </div>

                {result.hasDetailedReport && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-purple-400 flex items-center gap-1.5">
                      <Microscope className="w-3.5 h-3.5" />
                      Reporte forense detallado disponible en la planilla de Registros → botón "Ver Análisis"
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Recent uploads for this camera */}
            {uploads && uploads.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Historial de videos
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {uploads.slice(0, 5).map((upload) => (
                    <div key={upload.id} className="flex items-center gap-2 p-2 rounded-md bg-secondary text-xs">
                      <Clock className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-foreground truncate flex-1">{upload.originalFilename}</span>
                      <Badge className={`text-xs shrink-0 ${statusColor[upload.status] ?? ""}`}>
                        {statusLabel[upload.status] ?? upload.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Configurar Flechas ── */}
          <TabsContent value="config" className="mt-4">
            <DirectionArrowConfig
              cameraId={cameraId}
              cameraName={cameraName}
              initialConfig={savedDirectionConfig}
              onConfigSaved={(cfg) => setSavedDirectionConfig(cfg)}
            />
          </TabsContent>

          {/* ── Tab: Prompts / Skills ── */}
          <TabsContent value="prompts" className="mt-4">
            <PromptEditor
              cameraId={cameraId}
              cameraName={cameraName}
              cameraType={cameraType}
              initialSystemPrompt={initialSystemPrompt}
              initialUserPrompt={initialUserPrompt}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CameraPanel() {
  const { data: cameras, isLoading } = trpc.cameras.list.useQuery();

  return (
    <AccessControlLayout title="Panel de Cámaras">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-foreground">Cámaras de Control de Acceso</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configura las flechas de dirección, personaliza los prompts del agente IA y carga videos para analizar el acceso vehicular
          </p>
        </div>

        {/* Instructions */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {[
            { step: "1", text: "Configura las flechas de dirección en la pestaña Flechas" },
            { step: "2", text: "Personaliza los prompts del agente IA en la pestaña Prompts" },
            { step: "3", text: "Activa Análisis Detallado para reportes forenses completos" },
            { step: "4", text: "Carga el video y presiona Analizar para registrar los eventos" },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-center gap-3 p-3 rounded-lg bg-secondary border border-border">
              <div className="w-7 h-7 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary">{step}</span>
              </div>
              <p className="text-xs text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>

        {/* Camera cards */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {cameras?.map((cam) => (
              <CameraCard
                key={cam.id}
                cameraId={cam.id}
                cameraName={cam.name}
                cameraType={cam.type}
                location={cam.location || ""}
                directionConfig={(cam.directionConfig as DirectionConfig) ?? null}
                customSystemPrompt={(cam as any).customSystemPrompt ?? null}
                customUserPrompt={(cam as any).customUserPrompt ?? null}
              />
            ))}
          </div>
        )}
      </div>
    </AccessControlLayout>
  );
}

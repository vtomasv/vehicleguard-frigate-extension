import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import AccessControlLayout from "@/components/AccessControlLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cpu,
  Key,
  Link2,
  Zap,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  EyeOff,
  FlaskConical,
  Save,
  Info,
  Settings2,
} from "lucide-react";

// ─── Provider presets ─────────────────────────────────────────────────────────

const PROVIDERS = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    presenceModels: ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo"],
    analysisModels: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    supportsTopK: false,
    keyPlaceholder: "sk-...",
    docs: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    baseUrl: "https://api.anthropic.com/v1",
    presenceModels: ["claude-3-haiku-20240307", "claude-3-5-haiku-20241022"],
    analysisModels: ["claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"],
    supportsTopK: true,
    keyPlaceholder: "sk-ant-...",
    docs: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    presenceModels: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-8b"],
    analysisModels: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-2.5-flash"],
    supportsTopK: true,
    keyPlaceholder: "AIza...",
    docs: "https://aistudio.google.com/app/apikey",
  },
  {
    id: "ollama",
    label: "Ollama (Local)",
    baseUrl: "http://localhost:11434/v1",
    presenceModels: ["llava:7b", "llava:13b", "llava-phi3", "moondream"],
    analysisModels: ["llava:13b", "llava:34b", "llava-llama3", "llava:7b"],
    supportsTopK: false,
    keyPlaceholder: "(no se requiere)",
    docs: "https://ollama.com/library",
  },
  {
    id: "openai_compatible",
    label: "OpenAI-Compatible (LM Studio, vLLM, etc.)",
    baseUrl: "http://localhost:1234/v1",
    presenceModels: [],
    analysisModels: [],
    supportsTopK: false,
    keyPlaceholder: "lm-studio / (opcional)",
    docs: "https://lmstudio.ai/",
  },
] as const;

type ProviderId = typeof PROVIDERS[number]["id"];

// ─── Default values ───────────────────────────────────────────────────────────

const DEFAULTS = {
  provider: "openai" as ProviderId,
  apiKey: "",
  baseUrl: "",
  presenceModel: "gpt-4o-mini",
  analysisModel: "gpt-4o",
  temperature: 0.1,
  presenceTemperature: 0.0,
  maxTokens: 2048,
  topP: null as number | null,
  topK: null as number | null,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LLMSettings() {
  const { data: savedConfig, isLoading, refetch } = trpc.settings.getLLMConfig.useQuery();
  const saveMutation = trpc.settings.saveLLMConfig.useMutation();
  const testMutation = trpc.settings.testLLMConnection.useMutation();

  const [provider, setProvider] = useState<ProviderId>(DEFAULTS.provider);
  const [apiKey, setApiKey] = useState(DEFAULTS.apiKey);
  const [apiKeySet, setApiKeySet] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [baseUrl, setBaseUrl] = useState(DEFAULTS.baseUrl);
  const [presenceModel, setPresenceModel] = useState(DEFAULTS.presenceModel);
  const [analysisModel, setAnalysisModel] = useState(DEFAULTS.analysisModel);
  const [temperature, setTemperature] = useState(DEFAULTS.temperature);
  const [presenceTemperature, setPresenceTemperature] = useState(DEFAULTS.presenceTemperature);
  const [maxTokens, setMaxTokens] = useState(DEFAULTS.maxTokens);
  const [topP, setTopP] = useState<number | null>(DEFAULTS.topP);
  const [topK, setTopK] = useState<number | null>(DEFAULTS.topK);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const currentProvider = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  // Load saved config into form
  useEffect(() => {
    if (!savedConfig) return;
    setProvider(savedConfig.provider as ProviderId);
    setApiKeySet(savedConfig.apiKeySet ?? false);
    setBaseUrl(savedConfig.baseUrl ?? "");
    setPresenceModel(savedConfig.presenceModel);
    setAnalysisModel(savedConfig.analysisModel);
    setTemperature(savedConfig.temperature);
    setPresenceTemperature(savedConfig.presenceTemperature);
    setMaxTokens(savedConfig.maxTokens);
    setTopP(savedConfig.topP ?? null);
    setTopK(savedConfig.topK ?? null);
    setIsDirty(false);
  }, [savedConfig]);

  // When provider changes, update base URL and reset models to first preset
  const handleProviderChange = (val: ProviderId) => {
    const preset = PROVIDERS.find((p) => p.id === val)!;
    setProvider(val);
    setBaseUrl(preset.baseUrl);
    if (preset.presenceModels.length > 0) setPresenceModel(preset.presenceModels[0] as string);
    if (preset.analysisModels.length > 0) setAnalysisModel(preset.analysisModels[0] as string);
    setIsDirty(true);
  };

  const handleSave = async () => {
    try {
      await saveMutation.mutateAsync({
        provider,
        apiKey: apiKey || null,
        baseUrl: baseUrl || null,
        presenceModel,
        analysisModel,
        temperature,
        presenceTemperature,
        maxTokens,
        topP,
        topK,
      });
      toast.success("Configuración guardada", { description: "Los cambios se aplicarán al próximo análisis." });
      setIsDirty(false);
      setApiKey(""); // Clear after save
      refetch();
    } catch (err) {
      toast.error("Error al guardar", { description: String(err) });
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    try {
      const result = await testMutation.mutateAsync({
        provider,
        apiKey: apiKey || null,
        baseUrl: baseUrl || null,
        model: analysisModel,
      });
      if (result.success) {
        setTestResult({ ok: true, message: `Conexión exitosa. Respuesta: "${result.reply}"` });
      } else {
        setTestResult({ ok: false, message: result.error ?? "Error desconocido" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: String(err) });
    }
  };

  const markDirty = () => setIsDirty(true);

  if (isLoading) {
    return (
      <AccessControlLayout title="APIs y Modelos">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AccessControlLayout>
    );
  }

  return (
    <AccessControlLayout title="APIs y Modelos">
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Settings2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">APIs y Modelos LLM</h1>
            <p className="text-sm text-muted-foreground">
              Configura el proveedor de IA y los modelos usados para el análisis de vehículos
            </p>
          </div>
          {savedConfig && (
            <Badge variant="outline" className="ml-auto gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              Configurado
            </Badge>
          )}
        </div>

        {/* Provider */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              Proveedor de IA
            </CardTitle>
            <CardDescription>
              Selecciona el proveedor de modelos de lenguaje visual (LLM con visión)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id as ProviderId)}
                  className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                    provider === p.id
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:border-muted-foreground/50 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${provider === p.id ? "bg-primary" : "bg-muted-foreground/30"}`} />
                  <span className="text-sm font-medium">{p.label}</span>
                </button>
              ))}
            </div>

            {currentProvider.docs && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Info className="w-3 h-3" />
                Obtén tu API key en{" "}
                <a href={currentProvider.docs} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {currentProvider.docs}
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4 text-primary" />
              Autenticación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {provider !== "ollama" && (
              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  API Key
                  {apiKeySet && !apiKey && (
                    <Badge variant="secondary" className="ml-2 text-xs">Guardada</Badge>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); markDirty(); }}
                    placeholder={apiKeySet ? "••••••••••••••••" : currentProvider.keyPlaceholder}
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  La API key se almacena de forma segura y nunca se expone al frontend.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="baseUrl" className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" />
                Base URL
              </Label>
              <Input
                id="baseUrl"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); markDirty(); }}
                placeholder={currentProvider.baseUrl}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {provider === "ollama"
                  ? "URL de tu instancia Ollama local. Por defecto: http://localhost:11434/v1"
                  : provider === "openai_compatible"
                  ? "URL base de tu servidor compatible con OpenAI (LM Studio, vLLM, etc.)"
                  : "Deja en blanco para usar el endpoint oficial del proveedor."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Models */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Modelos por Tarea
            </CardTitle>
            <CardDescription>
              Usa un modelo ligero para detección de presencia y uno más potente para el análisis detallado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Presence model */}
            <div className="space-y-2">
              <Label>Modelo de Detección de Presencia</Label>
              <p className="text-xs text-muted-foreground">
                Llamada rápida por cada frame para detectar si hay un vehículo. Prioriza velocidad y bajo costo.
              </p>
              {currentProvider.presenceModels.length > 0 ? (
                <Select value={presenceModel} onValueChange={(v) => { setPresenceModel(v); markDirty(); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentProvider.presenceModels.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={presenceModel}
                  onChange={(e) => { setPresenceModel(e.target.value); markDirty(); }}
                  placeholder="nombre-del-modelo"
                  className="font-mono text-sm"
                />
              )}
            </div>

            <Separator />

            {/* Analysis model */}
            <div className="space-y-2">
              <Label>Modelo de Análisis Detallado</Label>
              <p className="text-xs text-muted-foreground">
                Análisis completo del vehículo: tipo, color, dirección, patente, marca, carga, etc. Prioriza calidad.
              </p>
              {currentProvider.analysisModels.length > 0 ? (
                <Select value={analysisModel} onValueChange={(v) => { setAnalysisModel(v); markDirty(); }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {currentProvider.analysisModels.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={analysisModel}
                  onChange={(e) => { setAnalysisModel(e.target.value); markDirty(); }}
                  placeholder="nombre-del-modelo"
                  className="font-mono text-sm"
                />
              )}
            </div>
          </CardContent>
        </Card>

        {/* Generation parameters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Parámetros de Generación
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Temperature */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Temperatura (análisis)</Label>
                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{temperature.toFixed(2)}</span>
              </div>
              <Slider
                min={0} max={1} step={0.05}
                value={[temperature]}
                onValueChange={([v]) => { setTemperature(v); markDirty(); }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Valores bajos (0.0–0.2) producen respuestas más deterministas. Recomendado: 0.1 para análisis de vehículos.
              </p>
            </div>

            <Separator />

            {/* Presence temperature */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Temperatura (detección de presencia)</Label>
                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{presenceTemperature.toFixed(2)}</span>
              </div>
              <Slider
                min={0} max={0.5} step={0.05}
                value={[presenceTemperature]}
                onValueChange={([v]) => { setPresenceTemperature(v); markDirty(); }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Para la detección de presencia se recomienda 0.0 (completamente determinista).
              </p>
            </div>

            <Separator />

            {/* Max tokens */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Max Tokens</Label>
                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{maxTokens}</span>
              </div>
              <Slider
                min={256} max={8192} step={256}
                value={[maxTokens]}
                onValueChange={([v]) => { setMaxTokens(v); markDirty(); }}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Tokens máximos en la respuesta. 2048 es suficiente para análisis detallado de vehículos.
              </p>
            </div>

            <Separator />

            {/* Top-P */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Top-P (nucleus sampling)</Label>
                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                  {topP !== null ? topP.toFixed(2) : "auto"}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  min={0} max={1} step={0.05}
                  value={[topP ?? 1.0]}
                  onValueChange={([v]) => { setTopP(v); markDirty(); }}
                  className="flex-1"
                  disabled={topP === null}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setTopP(topP === null ? 1.0 : null); markDirty(); }}
                  className="shrink-0 text-xs"
                >
                  {topP === null ? "Activar" : "Auto"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Deja en "auto" para usar el default del proveedor. Solo activa si necesitas control fino.
              </p>
            </div>

            {currentProvider.supportsTopK && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Top-K</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                      {topK !== null ? topK : "auto"}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Slider
                      min={1} max={100} step={1}
                      value={[topK ?? 40]}
                      onValueChange={([v]) => { setTopK(v); markDirty(); }}
                      className="flex-1"
                      disabled={topK === null}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setTopK(topK === null ? 40 : null); markDirty(); }}
                      className="shrink-0 text-xs"
                    >
                      {topK === null ? "Activar" : "Auto"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Disponible para {currentProvider.label}. Limita el vocabulario a los K tokens más probables.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Test connection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              Probar Conexión
            </CardTitle>
            <CardDescription>
              Verifica que el proveedor y modelo de análisis respondan correctamente antes de guardar
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleTest}
              disabled={testMutation.isPending}
              variant="outline"
              className="gap-2"
            >
              {testMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FlaskConical className="w-4 h-4" />
              )}
              {testMutation.isPending ? "Probando..." : "Probar conexión"}
            </Button>

            {testResult && (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg text-sm ${
                testResult.ok
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-destructive/10 border border-destructive/20 text-destructive"
              }`}>
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex items-center justify-between pt-2">
          {isDirty && (
            <p className="text-xs text-amber-500 flex items-center gap-1.5">
              <Info className="w-3 h-3" />
              Hay cambios sin guardar
            </p>
          )}
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="ml-auto gap-2"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveMutation.isPending ? "Guardando..." : "Guardar configuración"}
          </Button>
        </div>
      </div>
    </AccessControlLayout>
  );
}

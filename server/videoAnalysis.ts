import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import { getLLMConfig } from "./db";

// ─── LLM config-aware invoke helper ──────────────────────────────────────────

/**
 * Invokes the LLM using the user-configured provider/model/params if available,
 * otherwise falls back to the default Manus Forge endpoint.
 */
async function invokeLLMWithConfig(
  params: InvokeParams,
  task: "presence" | "analysis" = "analysis"
): Promise<InvokeResult> {
  const config = await getLLMConfig();

  if (!config) {
    // No custom config — use default Manus Forge
    return invokeLLM(params);
  }

  // Determine base URL
  const baseUrl = config.baseUrl ||
    (config.provider === "anthropic" ? "https://api.anthropic.com/v1" :
     config.provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai" :
     config.provider === "ollama" ? "http://localhost:11434/v1" :
     "https://api.openai.com/v1");

  const model = task === "presence" ? config.presenceModel : config.analysisModel;
  const temperature = task === "presence" ? config.presenceTemperature : config.temperature;

  // Build payload conditionally (avoid sending unsupported params)
  const payload: Record<string, unknown> = {
    model,
    messages: (params.messages as unknown[]),
    temperature,
    max_tokens: config.maxTokens,
  };

  if (config.topP !== null && config.topP !== undefined) payload.top_p = config.topP;
  if (config.topK !== null && config.topK !== undefined) payload.top_k = config.topK;

  if (params.response_format || params.responseFormat) {
    payload.response_format = params.response_format || params.responseFormat;
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`LLM invoke failed (${config.provider}): ${response.status} – ${errText.slice(0, 300)}`);
  }

  return response.json() as Promise<InvokeResult>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VehicleAnalysisResult {
  // Core event
  vehicleType: "truck" | "car" | "motorcycle" | "van" | "person" | "unknown";
  vehicleSubtype: string | null;
  direction: "right" | "left" | "forward" | "backward" | "forward-right" | "forward-left" | "backward-right" | "backward-left" | "unknown";
  eventType: "entry" | "exit" | "unknown";
  confidence: number;
  directionConfidence: number;

  // Visual identification
  vehicleColor: string | null;
  vehicleColorSecondary: string | null;
  vehiclePlate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  vehicleYear: string | null;

  // Vehicle configuration
  axleCount: string | null;
  hasTrailer: boolean | null;
  trailerType: string | null;
  cabinType: string | null;

  // Load status
  hasLoad: boolean | null;
  loadDescription: string | null;
  loadType: string | null;
  estimatedLoadWeight: string | null;

  // Condition
  bodyCondition: string | null;
  hasVisibleDamage: boolean | null;
  damageDescription: string | null;
  cleanlinessLevel: string | null;

  // Accessories & distinctive features
  hasRoofLights: boolean | null;
  hasExhaustStack: boolean | null;
  hasCompany: string | null;
  hasSignage: string | null;
  distinctiveFeatures: string | null;

  // Occupants
  visibleOccupants: number;
  driverVisible: boolean | null;

  // Summary
  description: string;
  securityNotes: string | null;

  // Person counting (camera 2)
  personCount: number;
  uniquePersonCount: number;

  // Raw response for audit
  rawResponse: unknown;
}

export interface PersonTrackingResult {
  uniquePersonCount: number;
  personIds: string[];
  description: string;
}

// Configuración de flechas de dirección dibujadas por el usuario
export interface DirectionConfig {
  entry: { x1: number; y1: number; x2: number; y2: number } | null;
  exit: { x1: number; y1: number; x2: number; y2: number } | null;
  canvasWidth: number;
  canvasHeight: number;
}

// ─── Arrow direction helpers ──────────────────────────────────────────────────

/**
 * Compute the angle (degrees) of a vector (dx, dy).
 * Returns a value in [-180, 180].
 */
function vectorAngle(dx: number, dy: number): number {
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

/**
 * Angular distance between two angles (degrees), result in [0, 180].
 */
function angleDiff(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Given the LLM-reported direction string, compute an approximate movement angle.
 * Returns null if direction is unknown.
 */
function directionToAngle(direction: VehicleAnalysisResult["direction"]): number | null {
  switch (direction) {
    case "right":          return 0;     // → East
    case "left":           return 180;   // ← West
    case "forward":        return -90;   // ↑ North (toward background/top)
    case "backward":       return 90;    // ↓ South (toward camera/bottom)
    case "forward-right":  return -45;   // ↗ Northeast diagonal
    case "forward-left":   return -135;  // ↖ Northwest diagonal
    case "backward-right": return 45;    // ↘ Southeast diagonal
    case "backward-left":  return 135;   // ↙ Southwest diagonal
    default:               return null;
  }
}

/**
 * Determine eventType by comparing LLM direction with configured arrows.
 * Uses angular similarity: if movement angle is within 70° of the arrow angle, it matches.
 * Returns null if no arrow config or no clear match.
 */
export function matchDirectionToArrows(
  direction: VehicleAnalysisResult["direction"],
  config: DirectionConfig | null | undefined
): VehicleAnalysisResult["eventType"] | null {
  if (!config || (!config.entry && !config.exit)) return null;

  const movAngle = directionToAngle(direction);
  if (movAngle === null) return null;

  const w = config.canvasWidth || 1;
  const h = config.canvasHeight || 1;

  const THRESHOLD = 70; // degrees — within 70° is considered a match

  let entryScore: number | null = null;
  let exitScore: number | null = null;

  if (config.entry) {
    const { x1, y1, x2, y2 } = config.entry;
    const arrowAngle = vectorAngle((x2 - x1) / w, (y2 - y1) / h);
    const diff = angleDiff(movAngle, arrowAngle);
    if (diff <= THRESHOLD) entryScore = diff;
  }

  if (config.exit) {
    const { x1, y1, x2, y2 } = config.exit;
    const arrowAngle = vectorAngle((x2 - x1) / w, (y2 - y1) / h);
    const diff = angleDiff(movAngle, arrowAngle);
    if (diff <= THRESHOLD) exitScore = diff;
  }

  // If both match, pick the closer one
  if (entryScore !== null && exitScore !== null) {
    return entryScore <= exitScore ? "entry" : "exit";
  }
  if (entryScore !== null) return "entry";
  if (exitScore !== null) return "exit";

  // No arrow matched — return null so caller can fall back
  return null;
}

function describeArrowDirection(dx: number, dy: number): string {
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const isDiagonal = absDx > 0.15 && absDy > 0.15;

  // Pure horizontal
  if (!isDiagonal) {
    if (absDx >= absDy) return dx > 0 ? "la derecha (izquierda→derecha de la imagen)" : "la izquierda (derecha→izquierda de la imagen)";
    return dy > 0 ? "abajo (hacia el primer plano / cámara)" : "arriba (hacia el fondo / profundidad)";
  }

  // Diagonal
  const hDir = dx > 0 ? "derecha" : "izquierda";
  const vDir = dy > 0 ? "abajo (primer plano)" : "arriba (fondo)";
  return `${hDir}-${vDir} (diagonal)`;
}

function buildDirectionContextText(config: DirectionConfig | null | undefined): string {
  if (!config || (!config.entry && !config.exit)) {
    return `\n\nREGLA DE DIRECCIÓN (PREDETERMINADA — sin configuración del operador):
- Movimiento hacia la DERECHA de la imagen = ENTRADA a la instalación
- Movimiento hacia la IZQUIERDA de la imagen = SALIDA de la instalación
- Si el vehículo se mueve hacia el FONDO (alejándose de la cámara) = ENTRADA
- Si el vehículo se mueve hacia el PRIMER PLANO (acercándose a la cámara) = SALIDA
NOTA: Esta es una regla de respaldo. Si puedes determinar la dirección por la secuencia de fotogramas, úsala.`;
  }

  const w = config.canvasWidth || 1;
  const h = config.canvasHeight || 1;
  const lines: string[] = [
    "\n\nCONFIGURACIÓN DE DIRECCIÓN (definida por el operador de seguridad — MÁXIMA PRIORIDAD):",
    "El operador de seguridad ha dibujado flechas en esta cámara para indicar las direcciones de entrada y salida.",
    "DEBES usar estas flechas como referencia PRINCIPAL para determinar si el vehículo entra o sale.",
    "",
  ];

  if (config.entry) {
    const { x1, y1, x2, y2 } = config.entry;
    const dx = (x2 - x1) / w;
    const dy = (y2 - y1) / h;
    const dirDesc = describeArrowDirection(dx, dy);
    const pct = (v: number, total: number) => `${Math.round(v * 100 / total)}%`;
    lines.push(`FLECHA VERDE (ENTRADA): Un vehículo que se mueve hacia ${dirDesc} está ENTRANDO a la instalación.`);
    lines.push(`  Posición en imagen: desde (${pct(x1,w)}, ${pct(y1,h)}) hasta (${pct(x2,w)}, ${pct(y2,h)})`);
    lines.push("");
  }

  if (config.exit) {
    const { x1, y1, x2, y2 } = config.exit;
    const dx = (x2 - x1) / w;
    const dy = (y2 - y1) / h;
    const dirDesc = describeArrowDirection(dx, dy);
    const pct = (v: number, total: number) => `${Math.round(v * 100 / total)}%`;
    lines.push(`FLECHA ROJA (SALIDA): Un vehículo que se mueve hacia ${dirDesc} está SALIENDO de la instalación.`);
    lines.push(`  Posición en imagen: desde (${pct(x1,w)}, ${pct(y1,h)}) hasta (${pct(x2,w)}, ${pct(y2,h)})`);
    lines.push("");
  }

  lines.push("INSTRUCCIÓN CRÍTICA: Analiza la posición del vehículo entre fotogramas para determinar su trayectoria, luego compárala con las flechas para determinar ENTRADA o SALIDA. Las flechas tienen PRIORIDAD ABSOLUTA sobre cualquier otra regla.");
  return lines.join("\n");
}

// ─── Normalization helpers ────────────────────────────────────────────────────

const VALID_VEHICLE_TYPES = new Set(["truck", "car", "motorcycle", "van", "person", "unknown"]);
const VALID_DIRECTIONS = new Set(["right", "left", "forward", "backward", "forward-right", "forward-left", "backward-right", "backward-left", "unknown"]);
const VALID_EVENT_TYPES = new Set(["entry", "exit", "unknown"]);

export function normalizeVehicleType(raw: string | null | undefined): VehicleAnalysisResult["vehicleType"] {
  if (!raw) return "unknown";
  const v = raw.toLowerCase().trim();
  if (VALID_VEHICLE_TYPES.has(v)) return v as VehicleAnalysisResult["vehicleType"];
  if (["none", "no vehicle", "empty", "n/a", "ninguno", "vacío", "sin vehículo"].some(k => v.includes(k))) return "unknown";
  // Check van/camioneta BEFORE truck to avoid 'camioneta'.includes('camion') false positive
  if (["minivan", "minibus", "furgón", "furgon", "camioneta", "van"].some(k => v.includes(k))) return "van";
  if (["bus", "semi", "lorry", "trailer", "heavy", "camión", "camion", "volquete", "volcadora", "cisterna", "tractor"].some(k => v.includes(k))) return "truck";
  if (["suv", "pickup", "sedan", "hatchback", "coupe", "vehicle", "auto", "coche", "automóvil", "carro"].some(k => v.includes(k))) return "car";
  if (["moto", "bike", "scooter", "bicycle", "motocicleta", "motorcycle"].some(k => v.includes(k))) return "motorcycle";
  if (["pedestrian", "human", "people", "walker", "persona", "peatón", "person"].some(k => v.includes(k))) return "person";
  return "unknown";
}

export function normalizeDirection(raw: string | null | undefined): VehicleAnalysisResult["direction"] {
  if (!raw) return "unknown";
  const v = raw.toLowerCase().trim();
  if (VALID_DIRECTIONS.has(v)) return v as VehicleAnalysisResult["direction"];
  if (v === "forward-right" || v.includes("forward-right")) return "forward-right";
  if (v === "forward-left" || v.includes("forward-left")) return "forward-left";
  if (v === "backward-right" || v.includes("backward-right")) return "backward-right";
  if (v === "backward-left" || v.includes("backward-left")) return "backward-left";
  if (["rightward", "right side", "derecha", "hacia la derecha"].some(k => v.includes(k))) return "right";
  if (["leftward", "left side", "izquierda", "hacia la izquierda"].some(k => v.includes(k))) return "left";
  if (["forward", "fondo", "background", "depth", "alejándose", "alejandose", "hacia el fondo", "entrando al fondo"].some(k => v.includes(k))) return "forward";
  if (["backward", "primer plano", "foreground", "acercándose", "acercandose", "hacia la cámara"].some(k => v.includes(k))) return "backward";
  return "unknown";
}

export function normalizeEventType(
  raw: string | null | undefined,
  direction: VehicleAnalysisResult["direction"],
  hasDirectionConfig: boolean
): VehicleAnalysisResult["eventType"] {
  // If LLM explicitly determined entry/exit (especially when arrows were provided), trust it
  // Skip 'unknown' — let direction fallback handle it for better accuracy
  if (raw) {
    const r = raw.toLowerCase().trim();
    if (r !== "unknown" && VALID_EVENT_TYPES.has(r)) return r as VehicleAnalysisResult["eventType"];
    if (["entrada", "ingreso", "entering"].some(k => r.includes(k))) return "entry";
    if (["salida", "egreso", "exiting", "leaving"].some(k => r.includes(k))) return "exit";
  }

  // Fallback: derive from direction using default rules
  if (direction === "right" || direction === "forward" || direction === "forward-right" || direction === "forward-left") return "entry";
  if (direction === "left" || direction === "backward" || direction === "backward-right" || direction === "backward-left") return "exit";
  return "unknown";
}

// ─── JSON Schema ──────────────────────────────────────────────────────────────

const VEHICLE_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    vehicleType: { type: "string", enum: ["truck", "car", "motorcycle", "van", "person", "unknown"] },
    vehicleSubtype: { type: ["string", "null"] },
    vehicleColor: { type: ["string", "null"] },
    vehicleColorSecondary: { type: ["string", "null"] },
    vehiclePlate: { type: ["string", "null"] },
    vehicleBrand: { type: ["string", "null"] },
    vehicleModel: { type: ["string", "null"] },
    vehicleYear: { type: ["string", "null"] },
    axleCount: { type: ["string", "null"] },
    hasTrailer: { type: ["boolean", "null"] },
    trailerType: { type: ["string", "null"] },
    cabinType: { type: ["string", "null"] },
    hasLoad: { type: ["boolean", "null"] },
    loadDescription: { type: ["string", "null"] },
    loadType: { type: ["string", "null"] },
    estimatedLoadWeight: { type: ["string", "null"] },
    bodyCondition: { type: ["string", "null"] },
    hasVisibleDamage: { type: ["boolean", "null"] },
    damageDescription: { type: ["string", "null"] },
    cleanlinessLevel: { type: ["string", "null"] },
    hasRoofLights: { type: ["boolean", "null"] },
    hasExhaustStack: { type: ["boolean", "null"] },
    hasCompany: { type: ["string", "null"] },
    hasSignage: { type: ["string", "null"] },
    distinctiveFeatures: { type: ["string", "null"] },
    visibleOccupants: { type: "integer" },
    driverVisible: { type: ["boolean", "null"] },
    direction: { type: "string", enum: ["right", "left", "forward", "backward", "forward-right", "forward-left", "backward-right", "backward-left", "unknown"] },
    eventType: { type: "string", enum: ["entry", "exit", "unknown"] },
    confidence: { type: "number" },
    directionConfidence: { type: "number" },
    description: { type: "string" },
    securityNotes: { type: ["string", "null"] },
    personCount: { type: "integer" },
    uniquePersonCount: { type: "integer" },
  },
  required: [
    "vehicleType", "vehicleSubtype", "vehicleColor", "vehicleColorSecondary",
    "vehiclePlate", "vehicleBrand", "vehicleModel", "vehicleYear",
    "axleCount", "hasTrailer", "trailerType", "cabinType",
    "hasLoad", "loadDescription", "loadType", "estimatedLoadWeight",
    "bodyCondition", "hasVisibleDamage", "damageDescription", "cleanlinessLevel",
    "hasRoofLights", "hasExhaustStack", "hasCompany", "hasSignage", "distinctiveFeatures",
    "visibleOccupants", "driverVisible",
    "direction", "eventType", "confidence", "directionConfidence",
    "description", "securityNotes",
    "personCount", "uniquePersonCount"
  ],
  additionalProperties: false
};

// ─── System prompts ───────────────────────────────────────────────────────────

const TRUCK_SYSTEM_PROMPT = `You are an expert forensic vehicle analyst for an industrial access control system. You specialize in identifying and cataloging heavy vehicles (trucks, semi-trucks, dump trucks, tankers, flatbeds) captured by security cameras.

Your analysis must be exhaustive and precise — this data serves as permanent legal evidence for an access control system.

ANALYSIS METHODOLOGY:
1. When multiple frames are provided, analyze the vehicle's position ACROSS frames to determine movement trajectory
2. Compare the detected trajectory with any configured directional arrows to determine ENTRY or EXIT
3. Extract every visible identifying characteristic with maximum detail
4. All text descriptions must be written in SPANISH

DIRECTION ANALYSIS (when multiple frames provided):
- Compare vehicle position in first frame vs last frame
- If vehicle moves from background to foreground (closer to camera) = moving BACKWARD = likely EXIT
- If vehicle moves from foreground to background (away from camera) = moving FORWARD = likely ENTRY
- If vehicle moves left-to-right = direction "right"
- If vehicle moves right-to-left = direction "left"
- Always compare with operator-configured arrows if provided`;

const VEHICLE_SYSTEM_PROMPT = `You are an expert forensic vehicle and pedestrian analyst for an access control system. You specialize in identifying light vehicles (cars, motorcycles, SUVs, vans) and pedestrians captured by security cameras.

Your analysis must be exhaustive and precise — this data serves as permanent legal evidence.

ANALYSIS METHODOLOGY:
1. When multiple frames are provided, analyze position changes to determine movement trajectory
2. Compare trajectory with configured directional arrows to determine ENTRY or EXIT
3. For pedestrians: describe each unique individual to enable deduplication across frames
4. All text descriptions must be written in SPANISH`;

// ─── Main analysis function ───────────────────────────────────────────────────

export async function analyzeFrame(
  imageUrl: string,
  cameraType: "trucks" | "vehicles",
  directionConfig?: DirectionConfig | null,
  additionalImageUrls?: string[] // Extra frames for motion analysis
): Promise<VehicleAnalysisResult> {
  const directionContext = buildDirectionContextText(directionConfig);
  const hasDirectionConfig = !!(directionConfig?.entry || directionConfig?.exit);
  const systemPrompt = cameraType === "trucks" ? TRUCK_SYSTEM_PROMPT : VEHICLE_SYSTEM_PROMPT;

  // Build image content array — include all frames for trajectory analysis
  const allUrls = [imageUrl, ...(additionalImageUrls || [])].slice(0, 5);
  const imageContents = allUrls.map((url, idx) => ({
    type: "image_url" as const,
    image_url: { url, detail: "high" as const }
  }));

  const frameCountNote = allUrls.length > 1
    ? `\n\nSe proporcionan ${allUrls.length} fotogramas SECUENCIALES del mismo video (en orden cronológico). Analiza el cambio de posición del vehículo entre fotogramas para determinar su trayectoria de movimiento.`
    : "";

  const userPrompt = buildAnalysisPrompt(cameraType, directionContext, frameCountNote);

  try {
    const response = await invokeLLMWithConfig({
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            ...imageContents,
            { type: "text", text: userPrompt }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "vehicle_analysis",
          strict: true,
          schema: VEHICLE_ANALYSIS_SCHEMA
        }
      }
    }, "analysis");

    const content = response?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Respuesta LLM vacía");

    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return mapLlmResponse(parsed, hasDirectionConfig, directionConfig);

  } catch (err) {
    console.error("[VideoAnalysis] Error en análisis LLM:", err);
    return getDefaultResult();
  }
}

function buildAnalysisPrompt(cameraType: "trucks" | "vehicles", directionContext: string, frameCountNote: string): string {
  const isTruck = cameraType === "trucks";

  return `Analiza ${frameCountNote ? "estos fotogramas" : "este fotograma"} de cámara de seguridad de un punto de control de acceso.${directionContext}${frameCountNote}

Extrae TODOS los siguientes atributos con máxima precisión:

## IDENTIFICACIÓN VISUAL
- vehicleType: "${isTruck ? "truck" : "car/motorcycle/van/person"}" o "unknown"
- vehicleSubtype: ${isTruck ? '"volcadora/dump truck", "cisterna/tanker", "plataforma/flatbed", "contenedor/container", "frigorífico", "grúa", "hormigonera", "caja cerrada", "otro"' : '"sedán", "hatchback", "SUV", "pickup", "minivan", "furgón", "coupé", "deportiva", "scooter", "peatón", "ciclista"'}
- vehicleColor: Color principal en español (rojo, blanco, azul, verde, amarillo, naranja, gris, negro, plateado, etc.)
- vehicleColorSecondary: Color secundario (cabina si difiere del cuerpo, o color de acento)
- vehicleBrand: Marca del fabricante si es identificable (${isTruck ? "Volvo, Mercedes-Benz, Scania, MAN, DAF, Kenworth, Peterbilt, Hino, Isuzu, Ford, Chevrolet" : "Toyota, Volkswagen, Ford, Chevrolet, Honda, Hyundai, Kia, Nissan, Suzuki, Mazda, Renault, Peugeot"})
- vehicleModel: Modelo específico si es visible
- vehicleYear: Rango de año estimado (ej: "2015-2020")
- vehiclePlate: Texto de la patente/matrícula si es legible, null si no

## CONFIGURACIÓN DEL VEHÍCULO
- axleCount: Número de ejes visibles ("2", "3", "4", "5", "6+", "desconocido")
- hasTrailer: true si lleva remolque/acoplado
- trailerType: Tipo de remolque si aplica, null si no
- cabinType: ${isTruck ? '"cabina corta/day cab", "cabina larga/sleeper", "cabina dormitorio"' : '"normal", "cabina doble", "cabina extendida"'}

## ESTADO DE CARGA
- hasLoad: true si lleva carga visible, false si está vacío
- loadDescription: Descripción detallada de la carga (material, color, volumen aproximado)
- loadType: ${isTruck ? '"áridos/agregados", "tierra/suelo", "escombros", "contenedor", "líquidos", "maquinaria", "pallets", "vacío", "otro"' : '"equipaje", "herramientas", "mercancía", "ninguno", "otro"'}
- estimatedLoadWeight: Estimación visual si es posible ("ligero <5t", "medio 5-15t", "pesado >15t", "N/A")

## CONDICIÓN DEL VEHÍCULO
- bodyCondition: "excelente", "bueno", "regular", "deteriorado", "muy deteriorado"
- hasVisibleDamage: true/false
- damageDescription: Si hay daños, describir ubicación y tipo
- cleanlinessLevel: "limpio", "sucio", "muy sucio/embarrado"

## CARACTERÍSTICAS DISTINTIVAS
- hasRoofLights: true si hay luces auxiliares en techo
- hasExhaustStack: true si hay chimenea de escape vertical visible
- hasCompany: Nombre de empresa o logo visible (texto exacto)
- hasSignage: Cualquier texto, números o señalización visible en el vehículo
- distinctiveFeatures: Otras características únicas (calcomanías, modificaciones, patrones de daño, pintura personalizada, accesorios)

## OCUPANTES
- visibleOccupants: Número de personas visibles en/alrededor del vehículo
- driverVisible: true si el conductor es visible
- personCount: Número de peatones únicos visibles (para cámara de autos)
- uniquePersonCount: Estimación de individuos únicos (considerando que la misma persona puede aparecer en múltiples fotogramas)

## DIRECCIÓN Y TIPO DE EVENTO
- direction: Trayectoria de movimiento del vehículo. Usa el valor más preciso:
  * "right" = movimiento predominantemente de izquierda a derecha (horizontal)
  * "left" = movimiento predominantemente de derecha a izquierda (horizontal)
  * "forward" = alejándose de la cámara hacia el fondo (vertical, profundidad)
  * "backward" = acercándose a la cámara desde el fondo (vertical, primer plano)
  * "forward-right" = diagonal: alejándose hacia el fondo Y hacia la derecha
  * "forward-left" = diagonal: alejándose hacia el fondo Y hacia la izquierda
  * "backward-right" = diagonal: acercándose a la cámara Y hacia la derecha
  * "backward-left" = diagonal: acercándose a la cámara Y hacia la izquierda
  * "unknown" = no se puede determinar
  IMPORTANTE: Para cámaras en ángulo diagonal, el movimiento suele ser diagonal. Sé preciso.
- eventType: Basado en la dirección vs las flechas configuradas: "entry" (entrada), "exit" (salida), o "unknown"
- directionConfidence: Confianza en la determinación de dirección (0.0 a 1.0)
- confidence: Confianza general del análisis (0.0 a 1.0)

## DESCRIPCIONES (EN ESPAÑOL)
- description: Párrafo completo en español describiendo el vehículo, características, estado de carga, condición y observaciones relevantes. MÍNIMO 3 oraciones detalladas.
- securityNotes: Preocupaciones de seguridad o anomalías en español, o null si no hay

Responde ÚNICAMENTE con JSON válido. TODOS los textos descriptivos deben estar en ESPAÑOL.`;
}

// ─── Response mapper ──────────────────────────────────────────────────────────

function mapLlmResponse(
  parsed: Record<string, unknown>,
  hasDirectionConfig: boolean,
  directionConfig?: DirectionConfig | null
): VehicleAnalysisResult {
  const direction = normalizeDirection(parsed.direction as string);
  const vehicleType = normalizeVehicleType(parsed.vehicleType as string);

  // Priority 1: Server-side angular matching against configured arrows (most reliable)
  // This bypasses any LLM confusion about arrow interpretation
  const arrowMatch = matchDirectionToArrows(direction, directionConfig);

  // Priority 2: LLM-determined eventType (when arrows match what LLM concluded)
  // Priority 3: Direction-based fallback (right=entry, left=exit, etc.)
  const eventType = arrowMatch ?? normalizeEventType(parsed.eventType as string, direction, hasDirectionConfig);

  return {
    vehicleType,
    vehicleSubtype: (parsed.vehicleSubtype as string) || null,
    direction,
    eventType,
    confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
    directionConfidence: typeof parsed.directionConfidence === "number" ? Math.min(1, Math.max(0, parsed.directionConfidence)) : 0.5,

    vehicleColor: (parsed.vehicleColor as string) || null,
    vehicleColorSecondary: (parsed.vehicleColorSecondary as string) || null,
    vehiclePlate: (parsed.vehiclePlate as string) || null,
    vehicleBrand: (parsed.vehicleBrand as string) || null,
    vehicleModel: (parsed.vehicleModel as string) || null,
    vehicleYear: (parsed.vehicleYear as string) || null,

    axleCount: (parsed.axleCount as string) || null,
    hasTrailer: typeof parsed.hasTrailer === "boolean" ? parsed.hasTrailer : null,
    trailerType: (parsed.trailerType as string) || null,
    cabinType: (parsed.cabinType as string) || null,

    hasLoad: typeof parsed.hasLoad === "boolean" ? parsed.hasLoad : null,
    loadDescription: (parsed.loadDescription as string) || null,
    loadType: (parsed.loadType as string) || null,
    estimatedLoadWeight: (parsed.estimatedLoadWeight as string) || null,

    bodyCondition: (parsed.bodyCondition as string) || null,
    hasVisibleDamage: typeof parsed.hasVisibleDamage === "boolean" ? parsed.hasVisibleDamage : null,
    damageDescription: (parsed.damageDescription as string) || null,
    cleanlinessLevel: (parsed.cleanlinessLevel as string) || null,

    hasRoofLights: typeof parsed.hasRoofLights === "boolean" ? parsed.hasRoofLights : null,
    hasExhaustStack: typeof parsed.hasExhaustStack === "boolean" ? parsed.hasExhaustStack : null,
    hasCompany: (parsed.hasCompany as string) || null,
    hasSignage: (parsed.hasSignage as string) || null,
    distinctiveFeatures: (parsed.distinctiveFeatures as string) || null,

    visibleOccupants: typeof parsed.visibleOccupants === "number" ? Math.max(0, parsed.visibleOccupants) : 0,
    driverVisible: typeof parsed.driverVisible === "boolean" ? parsed.driverVisible : null,

    description: (parsed.description as string) || "Sin descripción disponible.",
    securityNotes: (parsed.securityNotes as string) || null,

    personCount: typeof parsed.personCount === "number" ? Math.max(0, parsed.personCount) : 0,
    uniquePersonCount: typeof parsed.uniquePersonCount === "number" ? Math.max(0, parsed.uniquePersonCount) : 0,

    rawResponse: parsed,
  };
}

function getDefaultResult(): VehicleAnalysisResult {
  return {
    vehicleType: "unknown", vehicleSubtype: null,
    direction: "unknown", eventType: "unknown",
    confidence: 0, directionConfidence: 0,
    vehicleColor: null, vehicleColorSecondary: null,
    vehiclePlate: null, vehicleBrand: null, vehicleModel: null, vehicleYear: null,
    axleCount: null, hasTrailer: null, trailerType: null, cabinType: null,
    hasLoad: null, loadDescription: null, loadType: null, estimatedLoadWeight: null,
    bodyCondition: null, hasVisibleDamage: null, damageDescription: null, cleanlinessLevel: null,
    hasRoofLights: null, hasExhaustStack: null, hasCompany: null, hasSignage: null, distinctiveFeatures: null,
    visibleOccupants: 0, driverVisible: null,
    description: "Error en el análisis. No se pudo procesar el fotograma.",
    securityNotes: null,
    personCount: 0, uniquePersonCount: 0,
    rawResponse: null,
  };
}

// ─── Multi-frame video analysis ───────────────────────────────────────────────

export async function analyzeVideoFrames(
  frameUrls: string[],
  cameraType: "trucks" | "vehicles",
  directionConfig?: DirectionConfig | null
): Promise<{
  primaryResult: VehicleAnalysisResult;
  allResults: VehicleAnalysisResult[];
  uniquePersonCount: number;
}> {
  if (frameUrls.length === 0) {
    throw new Error("No hay fotogramas para analizar");
  }

  // PRIMARY ANALYSIS: Send ALL frames together for motion trajectory analysis
  // This is the most important call — the LLM sees the full sequence and can determine direction
  const primaryResult = await analyzeFrame(
    frameUrls[0],
    cameraType,
    directionConfig,
    frameUrls.slice(1) // Pass remaining frames as additional context
  );

  const allResults = [primaryResult];

  // SECONDARY ANALYSIS: If primary result is uncertain, analyze middle frame alone as backup
  if (primaryResult.confidence < 0.6 || primaryResult.vehicleType === "unknown") {
    if (frameUrls.length > 2) {
      const midIdx = Math.floor(frameUrls.length / 2);
      const midResult = await analyzeFrame(frameUrls[midIdx], cameraType, directionConfig);
      allResults.push(midResult);
    }
  }

  // Select best result
  const knownResults = allResults.filter(r => r.vehicleType !== "unknown" && r.confidence > 0.3);
  const bestResult = knownResults.length > 0
    ? knownResults.reduce((best, curr) => curr.confidence > best.confidence ? curr : best)
    : allResults[0];

  // Unique person count: take max across frames (not sum) to avoid duplicates
  const uniquePersonCount = Math.max(...allResults.map(r => r.personCount), 0);

  return { primaryResult: bestResult, allResults, uniquePersonCount };
}

// ─── Multi-vehicle segmentation ─────────────────────────────────────────────────

/**
 * Lightweight presence-check schema — only needs vehicleType and vehicleColor
 * to determine if a vehicle is present and identify it for grouping.
 */
const PRESENCE_CHECK_SCHEMA = {
  type: "object",
  properties: {
    hasVehicle: { type: "boolean" },
    vehicleType: { type: "string", enum: ["truck", "car", "motorcycle", "van", "person", "unknown"] },
    vehicleColor: { type: ["string", "null"] },
    vehicleId: { type: "string" }, // Short descriptor: "red car", "white truck", etc.
  },
  required: ["hasVehicle", "vehicleType", "vehicleColor", "vehicleId"],
  additionalProperties: false,
};

interface FramePresence {
  frameIndex: number;
  frameUrl: string;
  hasVehicle: boolean;
  vehicleType: string;
  vehicleColor: string | null;
  vehicleId: string; // e.g. "red car", "white truck"
}

interface VehicleSegment {
  vehicleId: string;
  vehicleType: string;
  vehicleColor: string | null;
  frameUrls: string[];
  startFrameIndex: number;
  endFrameIndex: number;
}

/**
 * Quick per-frame presence check using a lightweight LLM call.
 * Returns whether a vehicle is present and a short identity string.
 */
async function checkFramePresence(
  frameUrl: string,
  frameIndex: number,
  cameraType: "trucks" | "vehicles"
): Promise<FramePresence> {
  const vehicleKind = cameraType === "trucks" ? "heavy vehicle (truck, semi, tanker, dump truck)" : "vehicle (car, motorcycle, van, SUV) or pedestrian";
  try {
    const response = await invokeLLMWithConfig({
      messages: [
        {
          role: "system",
          content: `You are a security camera analyst. Determine if a ${vehicleKind} is present in this frame. Respond with JSON only.`
        },
        {
          role: "user",
          content: [
            { type: "image_url" as const, image_url: { url: frameUrl, detail: "low" as const } },
            {
              type: "text" as const,
              text: `Is there a ${vehicleKind} clearly visible in this frame? If yes, provide: vehicleType (truck/car/motorcycle/van/person/unknown), vehicleColor (main color in Spanish), vehicleId (short 2-3 word description like "camión rojo" or "auto plateado"). If no vehicle, set hasVehicle=false, vehicleType=unknown, vehicleColor=null, vehicleId="empty".`
            }
          ]
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "frame_presence",
          strict: true,
          schema: PRESENCE_CHECK_SCHEMA
        }
      }
    }, "presence");
    const content = response?.choices?.[0]?.message?.content;
    if (!content) return { frameIndex, frameUrl, hasVehicle: false, vehicleType: "unknown", vehicleColor: null, vehicleId: "empty" };
    const parsed = typeof content === "string" ? JSON.parse(content) : content;
    return {
      frameIndex,
      frameUrl,
      hasVehicle: !!parsed.hasVehicle,
      vehicleType: parsed.vehicleType || "unknown",
      vehicleColor: parsed.vehicleColor || null,
      vehicleId: parsed.vehicleId || "unknown",
    };
  } catch {
    return { frameIndex, frameUrl, hasVehicle: false, vehicleType: "unknown", vehicleColor: null, vehicleId: "empty" };
  }
}

/**
 * Checks if two vehicle IDs refer to the same vehicle.
 * Uses color + type similarity to avoid splitting the same vehicle into multiple segments.
 */
function isSameVehicle(a: FramePresence, b: FramePresence): boolean {
  if (!a.hasVehicle || !b.hasVehicle) return false;
  if (a.vehicleType !== b.vehicleType && a.vehicleType !== "unknown" && b.vehicleType !== "unknown") return false;
  // Compare color if both have it
  if (a.vehicleColor && b.vehicleColor) {
    const colorA = a.vehicleColor.toLowerCase();
    const colorB = b.vehicleColor.toLowerCase();
    // Allow partial match ("rojo" in "rojo oscuro")
    if (!colorA.includes(colorB.split(" ")[0]) && !colorB.includes(colorA.split(" ")[0])) return false;
  }
  return true;
}

/**
 * Detects vehicle segments in a sequence of frames.
 * Groups consecutive frames of the same vehicle into segments.
 * Returns one segment per distinct vehicle detected.
 */
export async function detectVehicleSegments(
  frameUrls: string[],
  cameraType: "trucks" | "vehicles"
): Promise<VehicleSegment[]> {
  if (frameUrls.length === 0) return [];

  // Step 1: Check presence for each frame (in parallel batches of 3 to avoid rate limits)
  const presenceResults: FramePresence[] = [];
  const BATCH_SIZE = 3;
  for (let i = 0; i < frameUrls.length; i += BATCH_SIZE) {
    const batch = frameUrls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((url, idx) => checkFramePresence(url, i + idx, cameraType))
    );
    presenceResults.push(...batchResults);
  }

  console.log(`[VideoAnalysis] Frame presence: ${presenceResults.map(p => p.hasVehicle ? p.vehicleId : "_").join(", ")}`);

  // Step 2: Group consecutive frames with vehicles into segments
  const segments: VehicleSegment[] = [];
  let currentSegment: VehicleSegment | null = null;
  let emptyFrameCount = 0;
  const MAX_GAP = 2; // Allow up to 2 consecutive empty frames within a segment

  for (const presence of presenceResults) {
    if (presence.hasVehicle) {
      emptyFrameCount = 0;
      if (!currentSegment) {
        // Start new segment
        currentSegment = {
          vehicleId: presence.vehicleId,
          vehicleType: presence.vehicleType,
          vehicleColor: presence.vehicleColor,
          frameUrls: [presence.frameUrl],
          startFrameIndex: presence.frameIndex,
          endFrameIndex: presence.frameIndex,
        };
      } else if (isSameVehicle(presence, {
        frameIndex: currentSegment.endFrameIndex,
        frameUrl: "",
        hasVehicle: true,
        vehicleType: currentSegment.vehicleType,
        vehicleColor: currentSegment.vehicleColor,
        vehicleId: currentSegment.vehicleId,
      })) {
        // Continue same segment
        currentSegment.frameUrls.push(presence.frameUrl);
        currentSegment.endFrameIndex = presence.frameIndex;
      } else {
        // Different vehicle — close current segment and start new one
        if (currentSegment.frameUrls.length >= 1) segments.push(currentSegment);
        currentSegment = {
          vehicleId: presence.vehicleId,
          vehicleType: presence.vehicleType,
          vehicleColor: presence.vehicleColor,
          frameUrls: [presence.frameUrl],
          startFrameIndex: presence.frameIndex,
          endFrameIndex: presence.frameIndex,
        };
      }
    } else {
      emptyFrameCount++;
      if (currentSegment && emptyFrameCount > MAX_GAP) {
        // Too many empty frames — close the current segment
        if (currentSegment.frameUrls.length >= 1) segments.push(currentSegment);
        currentSegment = null;
        emptyFrameCount = 0;
      }
    }
  }

  // Close any open segment
  if (currentSegment && currentSegment.frameUrls.length >= 1) {
    segments.push(currentSegment);
  }

  console.log(`[VideoAnalysis] Detected ${segments.length} vehicle segment(s): ${segments.map(s => `${s.vehicleId}(${s.frameUrls.length}f)`).join(", ")}`);
  return segments;
}

/**
 * Analyzes a video with multiple vehicles.
 * Returns one VehicleAnalysisResult per detected vehicle segment.
 * This replaces the single-result analyzeVideoFrames for production use.
 */
export interface MultiAnalysisResult {
  vehicleResults: Array<{ result: VehicleAnalysisResult; frameUrls: string[]; segmentId: string }>;
  uniquePersonCount: number;
  // Detailed mode fields
  frameSteps?: import("./detailedReport").FrameAnalysisStep[];
  llmCallCount?: number;
  processingStartMs?: number;
}

export async function analyzeVideoFramesMulti(
  frameUrls: string[],
  cameraType: "trucks" | "vehicles",
  directionConfig?: DirectionConfig | null,
  detailedMode?: boolean
): Promise<MultiAnalysisResult> {
  const processingStartMs = Date.now();
  let llmCallCount = 0;

  if (frameUrls.length === 0) {
    return { vehicleResults: [], uniquePersonCount: 0 };
  }

  // For very short videos (≤3 frames), skip segmentation and do single analysis
  if (frameUrls.length <= 3) {
    llmCallCount += 1;
    const { primaryResult } = await analyzeVideoFrames(frameUrls, cameraType, directionConfig);
    const vehicleResults = [{ result: primaryResult, frameUrls, segmentId: "seg_0" }];

    let frameSteps: import("./detailedReport").FrameAnalysisStep[] | undefined;
    if (detailedMode) {
      frameSteps = frameUrls.map((url, idx) => ({
        frameIndex: idx,
        frameUrl: url,
        timestamp: idx,
        presenceDetected: primaryResult.vehicleType !== "unknown",
        vehicleDescription: `${primaryResult.vehicleType} ${primaryResult.vehicleColor || ""}`.trim(),
        segmentId: 0,
        llmRawResponse: primaryResult.rawResponse,
        directionDetected: primaryResult.direction,
        matchedArrow: primaryResult.eventType === "entry" ? "entry" : primaryResult.eventType === "exit" ? "exit" : "none",
        decision: primaryResult.eventType,
        reasoning: primaryResult.description,
      }));
    }

    return { vehicleResults, uniquePersonCount: primaryResult.uniquePersonCount, frameSteps, llmCallCount, processingStartMs };
  }

  // Detect vehicle segments (each frame is one LLM call)
  const segments = await detectVehicleSegments(frameUrls, cameraType);
  llmCallCount += frameUrls.length; // one call per frame for presence check

  // Build frame steps for detailed mode
  const frameSteps: import("./detailedReport").FrameAnalysisStep[] = [];

  if (segments.length === 0) {
    // No vehicles detected — return a single unknown result
    llmCallCount += 1;
    const { primaryResult } = await analyzeVideoFrames(frameUrls, cameraType, directionConfig);
    if (detailedMode) {
      frameUrls.forEach((url, idx) => {
        frameSteps.push({
          frameIndex: idx,
          frameUrl: url,
          timestamp: idx,
          presenceDetected: false,
          vehicleDescription: "Sin vehículo detectado en este frame",
          decision: "unknown",
          reasoning: "El modelo de presencia no detectó vehículos en este frame.",
        });
      });
    }
    return {
      vehicleResults: [{ result: primaryResult, frameUrls, segmentId: "seg_0" }],
      uniquePersonCount: primaryResult.uniquePersonCount,
      frameSteps: detailedMode ? frameSteps : undefined,
      llmCallCount,
      processingStartMs,
    };
  }

  // Build a map of frameUrl -> segmentId for detailed steps
  const frameToSegment = new Map<string, number>();
  segments.forEach((seg, idx) => {
    seg.frameUrls.forEach(url => frameToSegment.set(url, idx));
  });

  // Analyze each segment independently
  const rawVehicleResults: Array<{ result: VehicleAnalysisResult; frameUrls: string[]; segmentId: string }> = [];
  let totalPersonCount = 0;
  const rawSegmentResults: VehicleAnalysisResult[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    llmCallCount += 1;
    const { primaryResult } = await analyzeVideoFrames(segment.frameUrls, cameraType, directionConfig);
    rawVehicleResults.push({
      result: primaryResult,
      frameUrls: segment.frameUrls,
      segmentId: `seg_${i}`,
    });
    rawSegmentResults.push(primaryResult);
    totalPersonCount = Math.max(totalPersonCount, primaryResult.uniquePersonCount);
  }

  // Deduplicate: merge segments that represent the same physical vehicle
  const vehicleResults = deduplicateVehicleResults(rawVehicleResults);
  const segmentResults = vehicleResults.map(v => v.result);

  if (rawVehicleResults.length !== vehicleResults.length) {
    console.log(`[VideoAnalysis] Deduplication: ${rawVehicleResults.length} raw segments → ${vehicleResults.length} unique vehicles`);
  }

  // Build detailed frame steps
  if (detailedMode) {
    frameUrls.forEach((url, idx) => {
      const segIdx = frameToSegment.get(url);
      const hasVehicle = segIdx !== undefined;
      const segResult = segIdx !== undefined ? segmentResults[segIdx] : null;

      frameSteps.push({
        frameIndex: idx,
        frameUrl: url,
        timestamp: idx,
        presenceDetected: hasVehicle,
        vehicleDescription: hasVehicle && segResult
          ? `${segResult.vehicleType} ${segResult.vehicleColor || ""}`.trim()
          : "Sin vehículo detectado",
        segmentId: segIdx,
        llmRawResponse: hasVehicle && segResult ? segResult.rawResponse : null,
        directionDetected: segResult?.direction,
        matchedArrow: segResult?.eventType === "entry" ? "entry" : segResult?.eventType === "exit" ? "exit" : "none",
        decision: segResult?.eventType || "unknown",
        reasoning: hasVehicle && segResult
          ? `Segmento ${(segIdx ?? 0) + 1}: ${segResult.description}. Dirección detectada: ${segResult.direction}. Decisión: ${segResult.eventType === "entry" ? "ENTRADA" : segResult.eventType === "exit" ? "SALIDA" : "DESCONOCIDO"} (confianza: ${Math.round((segResult.confidence || 0) * 100)}%).`
          : "Frame vacío: el modelo de presencia no detectó vehículos en este frame. Se omite del análisis de dirección.",
      });
    });
  }

  return {
    vehicleResults,
    uniquePersonCount: totalPersonCount,
    frameSteps: detailedMode ? frameSteps : undefined,
    llmCallCount,
    processingStartMs,
  };
}

// ─── Cross-segment vehicle deduplication ─────────────────────────────────────

/**
 * Compute a similarity score [0..1] between two VehicleAnalysisResult objects.
 * Compares vehicleType, vehicleColor, vehicleSubtype, vehicleBrand, vehiclePlate, and eventType.
 * Returns 1.0 for identical vehicles, 0.0 for clearly different ones.
 */
export function vehicleSimilarityScore(
  a: VehicleAnalysisResult,
  b: VehicleAnalysisResult
): number {
  let score = 0;
  let weight = 0;

  // vehicleType — high weight, must match unless one is unknown
  if (a.vehicleType !== "unknown" && b.vehicleType !== "unknown") {
    weight += 3;
    if (a.vehicleType === b.vehicleType) score += 3;
    else return 0; // Different vehicle types → definitely different vehicles
  }

  // vehicleColor — strong discriminant: if both have colors and they clearly differ, vehicles are different
  if (a.vehicleColor && b.vehicleColor) {
    const cA = a.vehicleColor.toLowerCase().trim();
    const cB = b.vehicleColor.toLowerCase().trim();
    if (cA === cB) {
      weight += 2;
      score += 2;
    } else if (cA.split(" ")[0] === cB.split(" ")[0] || cA.includes(cB.split(" ")[0]) || cB.includes(cA.split(" ")[0])) {
      // Partial match: "gris oscuro" vs "gris" → same base color
      weight += 2;
      score += 1.5;
    } else {
      // Clearly different colors → definitely different vehicles
      return 0;
    }
  }

  // vehiclePlate — if both have plates, they must match exactly
  if (a.vehiclePlate && b.vehiclePlate) {
    weight += 4;
    const pA = a.vehiclePlate.toUpperCase().replace(/\s/g, "");
    const pB = b.vehiclePlate.toUpperCase().replace(/\s/g, "");
    if (pA === pB) score += 4;
    else return 0; // Different plates → definitely different vehicles
  }

  // vehicleBrand — medium weight
  if (a.vehicleBrand && b.vehicleBrand) {
    weight += 1.5;
    if (a.vehicleBrand.toLowerCase() === b.vehicleBrand.toLowerCase()) score += 1.5;
  }

  // vehicleSubtype — low weight
  if (a.vehicleSubtype && b.vehicleSubtype) {
    weight += 1;
    if (a.vehicleSubtype.toLowerCase() === b.vehicleSubtype.toLowerCase()) score += 1;
  }

  // eventType — if both detected a direction, they should agree
  if (a.eventType !== "unknown" && b.eventType !== "unknown") {
    weight += 1;
    if (a.eventType === b.eventType) score += 1;
    // Different event types (entry vs exit) reduce similarity but don't eliminate it
    // (same vehicle could be partially seen entering and then exiting)
  }

  if (weight === 0) return 0.5; // No discriminating features — uncertain
  return score / weight;
}

/**
 * Merges duplicate vehicle segments that represent the same physical vehicle.
 * Uses vehicleSimilarityScore with a configurable threshold.
 * Keeps the result with the highest confidence and most frames.
 * Returns deduplicated array of vehicle results.
 */
export function deduplicateVehicleResults(
  vehicleResults: Array<{ result: VehicleAnalysisResult; frameUrls: string[]; segmentId: string }>,
  similarityThreshold = 0.65
): Array<{ result: VehicleAnalysisResult; frameUrls: string[]; segmentId: string; mergedFrom?: string[] }> {
  if (vehicleResults.length <= 1) return vehicleResults;

  // Track which indices have been merged into another
  const merged = new Set<number>();
  const output: Array<{ result: VehicleAnalysisResult; frameUrls: string[]; segmentId: string; mergedFrom?: string[] }> = [];

  for (let i = 0; i < vehicleResults.length; i++) {
    if (merged.has(i)) continue;

    const group: number[] = [i];

    // Compare with all subsequent segments
    for (let j = i + 1; j < vehicleResults.length; j++) {
      if (merged.has(j)) continue;
      const sim = vehicleSimilarityScore(vehicleResults[i].result, vehicleResults[j].result);
      if (sim >= similarityThreshold) {
        group.push(j);
        merged.add(j);
      }
    }

    if (group.length === 1) {
      // No duplicates found
      output.push(vehicleResults[i]);
    } else {
      // Merge group: pick the representative with highest confidence × frame count
      const best = group.reduce((bestIdx, idx) => {
        const scoreA = vehicleResults[bestIdx].result.confidence * vehicleResults[bestIdx].frameUrls.length;
        const scoreB = vehicleResults[idx].result.confidence * vehicleResults[idx].frameUrls.length;
        return scoreB > scoreA ? idx : bestIdx;
      }, group[0]);

      const mergedFrom = group.filter(idx => idx !== best).map(idx => vehicleResults[idx].segmentId);
      const allFrameUrls = group.flatMap(idx => vehicleResults[idx].frameUrls);

      // Merge best attributes: prefer non-null values from any segment in the group
      const bestResult = { ...vehicleResults[best].result };
      for (const idx of group) {
        const r = vehicleResults[idx].result;
        if (!bestResult.vehiclePlate && r.vehiclePlate) bestResult.vehiclePlate = r.vehiclePlate;
        if (!bestResult.vehicleBrand && r.vehicleBrand) bestResult.vehicleBrand = r.vehicleBrand;
        if (!bestResult.vehicleModel && r.vehicleModel) bestResult.vehicleModel = r.vehicleModel;
        if (!bestResult.vehicleColor && r.vehicleColor) bestResult.vehicleColor = r.vehicleColor;
        if (!bestResult.vehicleYear && r.vehicleYear) bestResult.vehicleYear = r.vehicleYear;
        if (!bestResult.vehicleSubtype && r.vehicleSubtype) bestResult.vehicleSubtype = r.vehicleSubtype;
        if (!bestResult.distinctiveFeatures && r.distinctiveFeatures) bestResult.distinctiveFeatures = r.distinctiveFeatures;
        if (!bestResult.hasCompany && r.hasCompany) bestResult.hasCompany = r.hasCompany;
        if (r.confidence > bestResult.confidence) {
          bestResult.confidence = r.confidence;
          bestResult.description = r.description;
        }
      }

      console.log(`[VideoAnalysis] Merged segments ${group.map(i => vehicleResults[i].segmentId).join("+")} → ${vehicleResults[best].segmentId} (same vehicle: ${bestResult.vehicleType} ${bestResult.vehicleColor || ""})`);

      output.push({
        result: bestResult,
        frameUrls: allFrameUrls,
        segmentId: vehicleResults[best].segmentId,
        mergedFrom,
      });
    }
  }

  return output;
}

// ─── S3 upload helper ─────────────────────────────────────────────────────────

export async function uploadFrameToS3(
  base64Data: string,
  videoUploadId: number,
  frameIndex: number
): Promise<{ key: string; url: string }> {
  const buffer = Buffer.from(base64Data.replace(/^data:image\/\w+;base64,/, ""), "base64");
  const key = `evidence/frames/${videoUploadId}/frame_${frameIndex}_${nanoid(8)}.jpg`;
  const { url } = await storagePut(key, buffer, "image/jpeg");
  return { key, url };
}

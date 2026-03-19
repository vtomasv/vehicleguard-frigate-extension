import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  json,
  boolean,
  float,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Cámaras del sistema de control de acceso
export const cameras = mysqlTable("cameras", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  type: mysqlEnum("type", ["trucks", "vehicles"]).notNull(),
  location: varchar("location", { length: 256 }),
  isActive: boolean("isActive").default(true).notNull(),
  directionConfig: json("directionConfig"),
  // Prompts personalizados por cámara
  customSystemPrompt: text("customSystemPrompt"),   // System prompt personalizado
  customUserPrompt: text("customUserPrompt"),       // User prompt personalizado (plantilla)
  promptVersion: int("promptVersion").default(1).notNull(), // Versión del prompt para auditoría
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Camera = typeof cameras.$inferSelect;
export type InsertCamera = typeof cameras.$inferInsert;

// Reportes detallados de análisis (generados cuando detailedMode=true)
export const analysisReports = mysqlTable("analysis_reports", {
  id: int("id").autoincrement().primaryKey(),
  accessEventId: int("accessEventId").notNull(), // Evento al que pertenece
  videoUploadId: int("videoUploadId").notNull(),
  cameraId: int("cameraId").notNull(),

  // Resumen ejecutivo
  summary: text("summary"),                        // Resumen del análisis completo
  totalFramesAnalyzed: int("totalFramesAnalyzed").default(0).notNull(),
  segmentsDetected: int("segmentsDetected").default(0).notNull(),
  finalDecision: varchar("finalDecision", { length: 32 }),  // entry/exit/unknown
  decisionReasoning: text("decisionReasoning"),    // Explicación del razonamiento final

  // Datos por frame (JSON array de FrameAnalysisStep)
  frameSteps: json("frameSteps"),                  // Array de pasos de análisis por frame

  // Frames anotados con flechas superpuestas
  annotatedFrameUrls: json("annotatedFrameUrls"),  // Array de URLs de frames anotados en S3

  // Configuración usada en el análisis
  directionConfigSnapshot: json("directionConfigSnapshot"), // Snapshot de flechas usadas
  promptSnapshot: text("promptSnapshot"),          // Prompt exacto enviado al LLM

  // Metadatos
  processingTimeMs: int("processingTimeMs"),        // Tiempo total de procesamiento
  llmCallCount: int("llmCallCount").default(0).notNull(), // Número de llamadas al LLM

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnalysisReport = typeof analysisReports.$inferSelect;
export type InsertAnalysisReport = typeof analysisReports.$inferInsert;

// Videos subidos para simulación de cámaras
export const videoUploads = mysqlTable("video_uploads", {
  id: int("id").autoincrement().primaryKey(),
  cameraId: int("cameraId").notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  originalFilename: varchar("originalFilename", { length: 512 }).notNull(),
  s3Key: varchar("s3Key", { length: 1024 }).notNull(),
  s3Url: text("s3Url").notNull(),
  fileSize: int("fileSize"),
  durationSeconds: float("durationSeconds"),
  status: mysqlEnum("status", ["pending", "processing", "completed", "error"]).default("pending").notNull(),
  errorMessage: text("errorMessage"),
  processedAt: timestamp("processedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VideoUpload = typeof videoUploads.$inferSelect;
export type InsertVideoUpload = typeof videoUploads.$inferInsert;

// Eventos de acceso detectados por análisis LLM
export const accessEvents = mysqlTable("access_events", {
  id: int("id").autoincrement().primaryKey(),
  cameraId: int("cameraId").notNull(),
  videoUploadId: int("videoUploadId"),
  eventType: mysqlEnum("eventType", ["entry", "exit", "unknown"]).notNull(),
  vehicleType: mysqlEnum("vehicleType", ["truck", "car", "motorcycle", "van", "person", "unknown"]).notNull(),
  direction: mysqlEnum("direction", ["right", "left", "forward", "backward", "forward-right", "forward-left", "backward-right", "backward-left", "unknown"]).default("unknown").notNull(),

  // ── Descripción general ─────────────────────────────────────────────────────
  llmDescription: text("llmDescription"),

  // ── Identificación visual básica ────────────────────────────────────────────
  vehicleColor: varchar("vehicleColor", { length: 64 }),         // Color principal
  vehicleColorSecondary: varchar("vehicleColorSecondary", { length: 64 }), // Color secundario/cabina
  vehiclePlate: varchar("vehiclePlate", { length: 32 }),          // Patente/matrícula si visible
  vehicleBrand: varchar("vehicleBrand", { length: 64 }),          // Marca (Volvo, Mercedes, etc.)
  vehicleModel: varchar("vehicleModel", { length: 64 }),          // Modelo si identificable
  vehicleYear: varchar("vehicleYear", { length: 16 }),            // Año estimado

  // ── Tipo y configuración del vehículo ───────────────────────────────────────
  vehicleSubtype: varchar("vehicleSubtype", { length: 64 }),      // Subtipo: volcadora, cisterna, plataforma, sedan, SUV, etc.
  axleCount: varchar("axleCount", { length: 16 }),                // Número de ejes (camiones)
  hasTrailer: boolean("hasTrailer"),                               // ¿Lleva remolque/acoplado?
  trailerType: varchar("trailerType", { length: 64 }),            // Tipo de remolque si aplica
  cabinType: varchar("cabinType", { length: 64 }),                // Tipo de cabina: corta, larga, dormitorio

  // ── Estado de carga ─────────────────────────────────────────────────────────
  hasLoad: boolean("hasLoad"),
  loadDescription: text("loadDescription"),                       // Descripción de la carga
  loadType: varchar("loadType", { length: 64 }),                  // Tipo: áridos, contenedor, líquidos, etc.
  estimatedLoadWeight: varchar("estimatedLoadWeight", { length: 32 }), // Peso estimado si visible

  // ── Estado y condición del vehículo ────────────────────────────────────────
  bodyCondition: varchar("bodyCondition", { length: 64 }),        // Estado carrocería: bueno, dañado, oxidado
  hasVisibleDamage: boolean("hasVisibleDamage"),                   // ¿Daños visibles?
  damageDescription: text("damageDescription"),                   // Descripción de daños si hay
  cleanlinessLevel: varchar("cleanlinessLevel", { length: 32 }),  // Limpieza: limpio, sucio, muy sucio

  // ── Accesorios y características distintivas ───────────────────────────────
  hasRoofLights: boolean("hasRoofLights"),                        // Luces en techo
  hasExhaustStack: boolean("hasExhaustStack"),                    // Chimenea de escape visible
  hasCompany: varchar("hasCompany", { length: 128 }),             // Nombre empresa/logo visible
  hasSignage: text("hasSignage"),                                 // Señalización, letreros, textos visibles
  distinctiveFeatures: text("distinctiveFeatures"),               // Otras características únicas

  // ── Ocupantes ───────────────────────────────────────────────────────────────
  visibleOccupants: int("visibleOccupants"),                      // Número de ocupantes visibles
  driverVisible: boolean("driverVisible"),                        // ¿Conductor visible?

  // ── Evidencia ───────────────────────────────────────────────────────────────
  evidenceFrameS3Key: varchar("evidenceFrameS3Key", { length: 1024 }),
  evidenceFrameUrl: text("evidenceFrameUrl"),

  // ── Análisis ────────────────────────────────────────────────────────────────
  confidence: float("confidence"),
  directionConfidence: float("directionConfidence"),              // Confianza específica en la dirección
  eventTimestamp: timestamp("eventTimestamp").notNull(),
  rawLlmResponse: json("rawLlmResponse"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AccessEvent = typeof accessEvents.$inferSelect;
export type InsertAccessEvent = typeof accessEvents.$inferInsert;

// Conteo único de personas (cámara 2)
export const personCounts = mysqlTable("person_counts", {
  id: int("id").autoincrement().primaryKey(),
  cameraId: int("cameraId").notNull(),
  videoUploadId: int("videoUploadId").notNull(),
  totalCount: int("totalCount").default(0).notNull(),
  detectedPersonIds: json("detectedPersonIds"),
  periodStart: timestamp("periodStart").notNull(),
  periodEnd: timestamp("periodEnd"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PersonCount = typeof personCounts.$inferSelect;
export type InsertPersonCount = typeof personCounts.$inferInsert;

// Configuración de APIs y modelos LLM
export const llmConfig = mysqlTable("llm_config", {
  id: int("id").autoincrement().primaryKey(),

  // Proveedor y autenticación
  provider: mysqlEnum("provider", ["openai", "anthropic", "gemini", "ollama", "openai_compatible"]).default("openai").notNull(),
  apiKey: text("apiKey"),                                // Encriptado en ttránsito, null para Ollama
  baseUrl: varchar("baseUrl", { length: 512 }),          // Custom base URL (Ollama, OpenAI-compatible)

  // Modelos por tarea
  presenceModel: varchar("presenceModel", { length: 128 }).default("gpt-4o-mini").notNull(),  // Modelo ligero para detección de presencia
  analysisModel: varchar("analysisModel", { length: 128 }).default("gpt-4o").notNull(),      // Modelo principal para análisis detallado

  // Parámetros de generación
  temperature: float("temperature").default(0.1).notNull(),
  maxTokens: int("maxTokens").default(2048).notNull(),
  topP: float("topP"),                                   // null = usar default del proveedor
  topK: int("topK"),                                     // Solo Gemini/Anthropic
  presenceTemperature: float("presenceTemperature").default(0.0).notNull(), // Temperatura para presencia (más determinista)

  // Estado
  isActive: boolean("isActive").default(true).notNull(),
  lastTestedAt: timestamp("lastTestedAt"),               // Última vez que se probó la conexión
  lastTestResult: mysqlEnum("lastTestResult", ["ok", "error", "pending"]),
  lastTestError: text("lastTestError"),

  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type LLMConfig = typeof llmConfig.$inferSelect;
export type InsertLLMConfig = typeof llmConfig.$inferInsert;

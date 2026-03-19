import { eq, desc, and, gte, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  users,
  cameras,
  videoUploads,
  accessEvents,
  personCounts,
  analysisReports,
  InsertCamera,
  InsertVideoUpload,
  InsertAccessEvent,
  InsertPersonCount,
  InsertAnalysisReport,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;

  for (const field of textFields) {
    const value = user[field];
    if (value === undefined) continue;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  }

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Cameras ─────────────────────────────────────────────────────────────────

export async function initDefaultCameras() {
  const db = await getDb();
  if (!db) return;

  const existing = await db.select().from(cameras).limit(1);
  if (existing.length > 0) return;

  await db.insert(cameras).values([
    {
      name: "Cámara 1 - Control de Camiones",
      description: "Cámara de acceso principal para control de camiones. Movimiento derecha=entrada, izquierda=salida.",
      type: "trucks",
      location: "Portón Principal Norte",
      isActive: true,
    },
    {
      name: "Cámara 2 - Control de Vehículos y Personas",
      description: "Cámara de acceso secundaria para autos y conteo de personas. Movimiento derecha=entrada, izquierda=salida.",
      type: "vehicles",
      location: "Portón Secundario Sur",
      isActive: true,
    },
  ]);
}

export async function getCameras() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cameras).orderBy(cameras.id);
}

export async function getCameraById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(cameras).where(eq(cameras.id, id)).limit(1);
  return result[0];
}

export async function updateCameraDirectionConfig(
  id: number,
  config: { entry: { x1: number; y1: number; x2: number; y2: number } | null; exit: { x1: number; y1: number; x2: number; y2: number } | null; canvasWidth: number; canvasHeight: number }
) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db.update(cameras).set({ directionConfig: config }).where(eq(cameras.id, id));
}

// ─── Video Uploads ────────────────────────────────────────────────────────────

export async function createVideoUpload(data: InsertVideoUpload) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(videoUploads).values(data);
  return result[0];
}

export async function updateVideoUploadStatus(
  id: number,
  status: "pending" | "processing" | "completed" | "error",
  extra?: { errorMessage?: string; processedAt?: Date; durationSeconds?: number }
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(videoUploads)
    .set({ status, ...extra })
    .where(eq(videoUploads.id, id));
}

export async function getVideoUploadById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(videoUploads).where(eq(videoUploads.id, id)).limit(1);
  return result[0];
}

export async function getVideoUploadsByCamera(cameraId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(videoUploads)
    .where(eq(videoUploads.cameraId, cameraId))
    .orderBy(desc(videoUploads.createdAt))
    .limit(20);
}

// ─── Access Events ────────────────────────────────────────────────────────────

export async function createAccessEvent(data: InsertAccessEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(accessEvents).values(data);
}

export async function getAccessEvents(filters?: {
  cameraId?: number;
  eventType?: "entry" | "exit" | "unknown";
  vehicleType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  if (!db) return [];

  const conditions = [];
  if (filters?.cameraId) conditions.push(eq(accessEvents.cameraId, filters.cameraId));
  if (filters?.eventType) conditions.push(eq(accessEvents.eventType, filters.eventType));
  if (filters?.from) conditions.push(gte(accessEvents.eventTimestamp, filters.from));
  if (filters?.to) conditions.push(lte(accessEvents.eventTimestamp, filters.to));

  const query = db
    .select({
      event: accessEvents,
      camera: cameras,
      videoFilename: videoUploads.originalFilename,
    })
    .from(accessEvents)
    .leftJoin(cameras, eq(accessEvents.cameraId, cameras.id))
    .leftJoin(videoUploads, eq(accessEvents.videoUploadId, videoUploads.id))
    .orderBy(desc(accessEvents.eventTimestamp))
    .limit(filters?.limit ?? 100)
    .offset(filters?.offset ?? 0);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }
  return query;
}

export async function getAccessEventById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({ event: accessEvents, camera: cameras })
    .from(accessEvents)
    .leftJoin(cameras, eq(accessEvents.cameraId, cameras.id))
    .where(eq(accessEvents.id, id))
    .limit(1);
  return result[0];
}

// ─── Dashboard Stats ──────────────────────────────────────────────────────────

export async function getDashboardStats(from?: Date, to?: Date) {
  const db = await getDb();
  if (!db) return null;

  const conditions = [];
  if (from) conditions.push(gte(accessEvents.eventTimestamp, from));
  if (to) conditions.push(lte(accessEvents.eventTimestamp, to));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const totalQuery = db
    .select({
      eventType: accessEvents.eventType,
      vehicleType: accessEvents.vehicleType,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(accessEvents)
    .groupBy(accessEvents.eventType, accessEvents.vehicleType);

  // Use raw SQL string for HOUR() — TiDB/MySQL rejects HOUR(drizzle_column_ref)
  // because Drizzle wraps the column in backticks making it look like a column name.
  const hourlyQuery = db
    .select({
      hour: sql<number>`HOUR(eventTimestamp)`.as("hour"),
      eventType: accessEvents.eventType,
      vehicleType: accessEvents.vehicleType,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(accessEvents)
    .groupBy(
      sql`HOUR(eventTimestamp)`,
      accessEvents.eventType,
      accessEvents.vehicleType
    )
    .orderBy(sql`HOUR(eventTimestamp)`);

  const [totals, hourly] = await Promise.all([
    whereClause ? totalQuery.where(whereClause) : totalQuery,
    whereClause ? hourlyQuery.where(whereClause) : hourlyQuery,
  ]);

  return { totals, hourly };
}

// ─── Person Counts ────────────────────────────────────────────────────────────

export async function upsertPersonCount(data: InsertPersonCount) {
  const db = await getDb();
  if (!db) return;
  await db.insert(personCounts).values(data);
}

export async function getPersonCountsByCamera(cameraId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(personCounts)
    .where(eq(personCounts.cameraId, cameraId))
    .orderBy(desc(personCounts.createdAt))
    .limit(10);
}

// ─── Analysis Reports ─────────────────────────────────────────────────────────

export async function createAnalysisReport(data: InsertAnalysisReport) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(analysisReports).values(data);
  return result[0];
}

export async function getAnalysisReportByEventId(accessEventId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(analysisReports)
    .where(eq(analysisReports.accessEventId, accessEventId))
    .limit(1);
  return result[0];
}

export async function getAnalysisReportById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(analysisReports)
    .where(eq(analysisReports.id, id))
    .limit(1);
  return result[0];
}

// ─── Camera Prompts ───────────────────────────────────────────────────────────

export async function updateCameraPrompts(
  id: number,
  prompts: { customSystemPrompt?: string | null; customUserPrompt?: string | null }
) {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");
  await db
    .update(cameras)
    .set({
      customSystemPrompt: prompts.customSystemPrompt ?? null,
      customUserPrompt: prompts.customUserPrompt ?? null,
      promptVersion: sql`promptVersion + 1`,
    })
    .where(eq(cameras.id, id));
}

export async function getCameraPrompts(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({
      customSystemPrompt: cameras.customSystemPrompt,
      customUserPrompt: cameras.customUserPrompt,
      promptVersion: cameras.promptVersion,
    })
    .from(cameras)
    .where(eq(cameras.id, id))
    .limit(1);
  return result[0] ?? null;
}

// ─── LLM Configuration ───────────────────────────────────────────────────────

import { llmConfig, InsertLLMConfig, LLMConfig } from "../drizzle/schema";

export async function getLLMConfig(): Promise<LLMConfig | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select()
    .from(llmConfig)
    .where(eq(llmConfig.isActive, true))
    .orderBy(llmConfig.updatedAt)
    .limit(1);
  return result[0] ?? null;
}

export async function upsertLLMConfig(
  config: Omit<InsertLLMConfig, "id" | "createdAt" | "updatedAt">
): Promise<LLMConfig> {
  const db = await getDb();
  if (!db) throw new Error("Base de datos no disponible");

  // Check if a config already exists
  const existing = await db.select({ id: llmConfig.id }).from(llmConfig).limit(1);

  if (existing.length > 0) {
    // Update existing
    await db.update(llmConfig).set({ ...config, isActive: true }).where(eq(llmConfig.id, existing[0].id));
    const updated = await db.select().from(llmConfig).where(eq(llmConfig.id, existing[0].id)).limit(1);
    return updated[0];
  } else {
    // Insert new
    await db.insert(llmConfig).values({ ...config, isActive: true });
    const inserted = await db.select().from(llmConfig).orderBy(llmConfig.id).limit(1);
    return inserted[0];
  }
}

export async function updateLLMConfigTestResult(
  id: number,
  result: "ok" | "error",
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(llmConfig)
    .set({
      lastTestResult: result,
      lastTestError: errorMessage ?? null,
      lastTestedAt: new Date(),
    })
    .where(eq(llmConfig.id, id));
}

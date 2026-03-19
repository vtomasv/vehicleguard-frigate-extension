import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  getCameras,
  getCameraById,
  initDefaultCameras,
  updateCameraDirectionConfig,
  updateCameraPrompts,
  getCameraPrompts,
  createVideoUpload,
  updateVideoUploadStatus,
  getVideoUploadById,
  getVideoUploadsByCamera,
  createAccessEvent,
  getAccessEvents,
  getAccessEventById,
  getDashboardStats,
  getPersonCountsByCamera,
  upsertPersonCount,
  createAnalysisReport,
  getAnalysisReportByEventId,
  getAnalysisReportById,
  getLLMConfig,
  upsertLLMConfig,
  updateLLMConfigTestResult,
} from "./db";
import { storagePut } from "./storage";
import { analyzeVideoFramesMulti, uploadFrameToS3, type DirectionConfig } from "./videoAnalysis";
import { generateDetailedReport } from "./detailedReport";
import { notifyOwner } from "./_core/notification";
import { nanoid } from "nanoid";

// ─── Cameras Router ───────────────────────────────────────────────────────────

const camerasRouter = router({
  list: publicProcedure.query(async () => {
    await initDefaultCameras();
    return getCameras();
  }),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const camera = await getCameraById(input.id);
      if (!camera) throw new TRPCError({ code: "NOT_FOUND", message: "Camera not found" });
      return camera;
    }),

  // Actualiza los prompts personalizados de la cámara
  updatePrompts: protectedProcedure
    .input(
      z.object({
        cameraId: z.number(),
        customSystemPrompt: z.string().nullable().optional(),
        customUserPrompt: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const camera = await getCameraById(input.cameraId);
      if (!camera) throw new TRPCError({ code: "NOT_FOUND", message: "Cámara no encontrada" });
      await updateCameraPrompts(input.cameraId, {
        customSystemPrompt: input.customSystemPrompt,
        customUserPrompt: input.customUserPrompt,
      });
      return { success: true };
    }),

  getPrompts: protectedProcedure
    .input(z.object({ cameraId: z.number() }))
    .query(async ({ input }) => {
      return getCameraPrompts(input.cameraId);
    }),

  // Guarda la configuración de flechas de dirección dibujadas por el operador
  updateDirectionConfig: protectedProcedure
    .input(
      z.object({
        cameraId: z.number(),
        config: z.object({
          entry: z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }).nullable(),
          exit: z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }).nullable(),
          canvasWidth: z.number(),
          canvasHeight: z.number(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const camera = await getCameraById(input.cameraId);
      if (!camera) throw new TRPCError({ code: "NOT_FOUND", message: "Cámara no encontrada" });
      await updateCameraDirectionConfig(input.cameraId, input.config);
      return { success: true };
    }),
});

// ─── Video Upload Router ──────────────────────────────────────────────────────

const videoRouter = router({
  upload: protectedProcedure
    .input(
      z.object({
        cameraId: z.number(),
        filename: z.string(),
        base64Data: z.string(),
        mimeType: z.string().default("video/mp4"),
        fileSize: z.number().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const camera = await getCameraById(input.cameraId);
      if (!camera) throw new TRPCError({ code: "NOT_FOUND", message: "Camera not found" });

      const buffer = Buffer.from(input.base64Data, "base64");
      const s3Key = `videos/camera_${input.cameraId}/${nanoid(12)}_${input.filename}`;
      const { url: s3Url } = await storagePut(s3Key, buffer, input.mimeType);

      await createVideoUpload({
        cameraId: input.cameraId,
        uploadedBy: ctx.user.id,
        originalFilename: input.filename,
        s3Key,
        s3Url,
        fileSize: input.fileSize,
        status: "pending",
      });

      const uploads = await getVideoUploadsByCamera(input.cameraId);
      const upload = uploads[0];

      return { uploadId: upload.id, s3Url, status: "pending" };
    }),

  getByCamera: protectedProcedure
    .input(z.object({ cameraId: z.number() }))
    .query(async ({ input }) => {
      return getVideoUploadsByCamera(input.cameraId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const upload = await getVideoUploadById(input.id);
      if (!upload) throw new TRPCError({ code: "NOT_FOUND" });
      return upload;
    }),

  // Process video: analyze frames with LLM vision
  processVideo: protectedProcedure
    .input(
      z.object({
        uploadId: z.number(),
        frames: z.array(
          z.object({
            base64: z.string(),
            timestampSeconds: z.number(),
          })
        ),
        durationSeconds: z.number().optional(),
        detailedMode: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const upload = await getVideoUploadById(input.uploadId);
      if (!upload) throw new TRPCError({ code: "NOT_FOUND", message: "Video upload not found" });

      const camera = await getCameraById(upload.cameraId);
      if (!camera) throw new TRPCError({ code: "NOT_FOUND", message: "Camera not found" });

      await updateVideoUploadStatus(input.uploadId, "processing", {
        durationSeconds: input.durationSeconds,
      });

      try {
        // Upload frames to S3 for evidence
        const frameUrls: string[] = [];
        const frameS3Keys: string[] = [];

        for (let i = 0; i < input.frames.length; i++) {
          const frame = input.frames[i];
          const { key, url } = await uploadFrameToS3(frame.base64, input.uploadId, i);
          frameUrls.push(url);
          frameS3Keys.push(key);
        }

        // Custom prompts from camera config
        const customPrompts = camera.customSystemPrompt || camera.customUserPrompt
          ? { systemPrompt: camera.customSystemPrompt ?? undefined, userPrompt: camera.customUserPrompt ?? undefined }
          : undefined;

        const directionConfig = camera.directionConfig as DirectionConfig | null;
        const analysisStartTime = Date.now();

        // Multi-vehicle detection — each distinct vehicle gets its own access_event
        const { vehicleResults, uniquePersonCount, frameSteps } = await analyzeVideoFramesMulti(
          frameUrls,
          camera.type,
          directionConfig,
          input.detailedMode
        );

        const VALID_VEHICLE_TYPES = ["truck", "car", "motorcycle", "van", "person", "unknown"] as const;
        const VALID_DIRECTIONS = ["right", "left", "forward", "backward", "forward-right", "forward-left", "backward-right", "backward-left", "unknown"] as const;
        const VALID_EVENT_TYPES = ["entry", "exit", "unknown"] as const;

        const createdEventIds: number[] = [];

        for (let segIdx = 0; segIdx < vehicleResults.length; segIdx++) {
          const { result: r, frameUrls: segFrameUrls, segmentId } = vehicleResults[segIdx];

          const safeVehicleType = VALID_VEHICLE_TYPES.includes(r.vehicleType as never) ? r.vehicleType : "unknown" as const;
          const safeDirection = VALID_DIRECTIONS.includes(r.direction as never) ? r.direction : "unknown" as const;
          const safeEventType = VALID_EVENT_TYPES.includes(r.eventType as never) ? r.eventType : "unknown" as const;

          const segFrameIdx = frameUrls.indexOf(segFrameUrls[0]);
          const evidenceKey = frameS3Keys[segFrameIdx >= 0 ? segFrameIdx : 0] || null;
          const evidenceUrl = frameUrls[segFrameIdx >= 0 ? segFrameIdx : 0] || null;
          const eventTimestamp = new Date(Date.now() + segIdx * 1000);

          await createAccessEvent({
            cameraId: upload.cameraId,
            videoUploadId: input.uploadId,
            eventType: safeEventType,
            vehicleType: safeVehicleType,
            direction: safeDirection,
            llmDescription: r.description,
            vehicleColor: r.vehicleColor,
            vehicleColorSecondary: r.vehicleColorSecondary,
            vehiclePlate: r.vehiclePlate,
            vehicleBrand: r.vehicleBrand,
            vehicleModel: r.vehicleModel,
            vehicleYear: r.vehicleYear,
            vehicleSubtype: r.vehicleSubtype,
            axleCount: r.axleCount,
            hasTrailer: r.hasTrailer,
            trailerType: r.trailerType,
            cabinType: r.cabinType,
            hasLoad: r.hasLoad,
            loadDescription: r.loadDescription,
            loadType: r.loadType,
            estimatedLoadWeight: r.estimatedLoadWeight,
            bodyCondition: r.bodyCondition,
            hasVisibleDamage: r.hasVisibleDamage,
            damageDescription: r.damageDescription,
            cleanlinessLevel: r.cleanlinessLevel,
            hasRoofLights: r.hasRoofLights,
            hasExhaustStack: r.hasExhaustStack,
            hasCompany: r.hasCompany,
            hasSignage: r.hasSignage,
            distinctiveFeatures: r.distinctiveFeatures,
            visibleOccupants: r.visibleOccupants,
            driverVisible: r.driverVisible,
            evidenceFrameS3Key: evidenceKey,
            evidenceFrameUrl: evidenceUrl,
            confidence: r.confidence,
            directionConfidence: r.directionConfidence,
            eventTimestamp,
            rawLlmResponse: r.rawResponse,
          });

          // Get the latest created event ID
          const latestEvents = await getAccessEvents({ cameraId: upload.cameraId, limit: 1 });
          const latestEventId = latestEvents[0]?.event?.id;

          // Generate detailed report if detailedMode is enabled
          if (input.detailedMode && latestEventId && frameSteps) {
            const segmentSteps = frameSteps.filter(s => String(s.segmentId) === String(segmentId));
            const processingTimeMs = Date.now() - analysisStartTime;
            try {
              const report = await generateDetailedReport({
                accessEventId: latestEventId,
                videoUploadId: input.uploadId,
                cameraId: upload.cameraId,
                cameraType: camera.type,
                vehicleResult: r,
                frameSteps: segmentSteps,
                frameUrls: segFrameUrls,
                directionConfig,
                processingTimeMs,
                llmCallCount: segmentSteps.length + 1,
                promptSnapshot: customPrompts?.systemPrompt ?? "default",
              });
              await createAnalysisReport({
                accessEventId: latestEventId,
                videoUploadId: input.uploadId,
                cameraId: upload.cameraId,
                summary: report.summary,
                totalFramesAnalyzed: report.totalFramesAnalyzed,
                segmentsDetected: vehicleResults.length,
                finalDecision: safeEventType,
                decisionReasoning: report.decisionReasoning,
                frameSteps: report.frameSteps,
                annotatedFrameUrls: report.annotatedFrameUrls,
                directionConfigSnapshot: directionConfig,
                promptSnapshot: customPrompts?.systemPrompt ?? "default",
                processingTimeMs,
                llmCallCount: segmentSteps.length + 1,
              });
            } catch (reportErr) {
              console.error("[DetailedReport] Failed to generate:", reportErr);
            }
          }

          if (latestEventId) createdEventIds.push(latestEventId);

          // Notify owner for significant events
          const isSignificant = safeEventType !== "unknown" && safeVehicleType !== "unknown" && r.confidence > 0.5;
          if (isSignificant) {
            const eventLabel = safeEventType === "entry" ? "ENTRADA" : "SALIDA";
            const vehicleLabel = safeVehicleType === "truck" ? "Camión" :
              safeVehicleType === "car" ? "Auto" :
              safeVehicleType === "van" ? "Camioneta" :
              safeVehicleType === "motorcycle" ? "Moto" : "Vehículo";
            await notifyOwner({
              title: `🚨 Control de Acceso: ${eventLabel} - ${vehicleLabel} (${segIdx + 1}/${vehicleResults.length})`,
              content: `**Cámara:** ${camera.name}\n**Evento:** ${eventLabel}\n**Vehículo:** ${vehicleLabel}\n**Color:** ${r.vehicleColor || "N/D"}\n**Patente:** ${r.vehiclePlate || "N/D"}\n**Carga:** ${r.hasLoad ? "Sí - " + (r.loadDescription || "") : "No"}\n**Confianza:** ${Math.round(r.confidence * 100)}%\n\n**Descripción:** ${r.description}`,
            }).catch(() => {});
          }
        }

        // Handle person counting for camera 2
        if (camera.type === "vehicles" && uniquePersonCount > 0) {
          await upsertPersonCount({
            cameraId: upload.cameraId,
            videoUploadId: input.uploadId,
            totalCount: uniquePersonCount,
            detectedPersonIds: [],
            periodStart: new Date(),
            periodEnd: new Date(),
          });
        }

        await updateVideoUploadStatus(input.uploadId, "completed", {
          processedAt: new Date(),
          durationSeconds: input.durationSeconds,
        });

        const primaryResult = vehicleResults[0]?.result;
        return {
          success: true,
          eventsCreated: createdEventIds.length,
          eventType: primaryResult?.eventType ?? "unknown",
          vehicleType: primaryResult?.vehicleType ?? "unknown",
          description: primaryResult?.description ?? "Sin descripción",
          confidence: primaryResult?.confidence ?? 0,
          uniquePersonCount,
          framesAnalyzed: frameUrls.length,
          detailedMode: input.detailedMode,
        };
      } catch (err) {
        await updateVideoUploadStatus(input.uploadId, "error", {
          errorMessage: String(err),
        });
        await notifyOwner({
          title: "⚠️ Error en procesamiento de video - Control de Acceso",
          content: `Error al procesar video en cámara ${camera.name}: ${String(err)}`,
        }).catch(() => {});
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Video processing failed: ${String(err)}`,
        });
      }
    }),
});

// ─── Analysis Reports Router ──────────────────────────────────────────────────

const reportsRouter = router({
  getByEventId: protectedProcedure
    .input(z.object({ eventId: z.number() }))
    .query(async ({ input }) => {
      return getAnalysisReportByEventId(input.eventId);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const report = await getAnalysisReportById(input.id);
      if (!report) throw new TRPCError({ code: "NOT_FOUND" });
      return report;
    }),
});

// ─── Access Events Router ─────────────────────────────────────────────────────

const eventsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        cameraId: z.number().optional(),
        eventType: z.enum(["entry", "exit", "unknown"]).optional(),
        from: z.date().optional(),
        to: z.date().optional(),
        limit: z.number().min(1).max(500).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      return getAccessEvents(input);
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const event = await getAccessEventById(input.id);
      if (!event) throw new TRPCError({ code: "NOT_FOUND" });
      return event;
    }),
});

// ─── Dashboard Router ─────────────────────────────────────────────────────────

const dashboardRouter = router({
  stats: protectedProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
      })
    )
    .query(async ({ input }) => {
      return getDashboardStats(input.from, input.to);
    }),

  personCounts: protectedProcedure
    .input(z.object({ cameraId: z.number() }))
    .query(async ({ input }) => {
      return getPersonCountsByCamera(input.cameraId);
    }),
});

// ─── Settings Router (LLM Config) ─────────────────────────────────────────────────

const LLMConfigInputSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "ollama", "openai_compatible"]),
  apiKey: z.string().nullable().optional(),
  baseUrl: z.string().nullable().optional(),
  presenceModel: z.string().min(1),
  analysisModel: z.string().min(1),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(256).max(32768),
  topP: z.number().min(0).max(1).nullable().optional(),
  topK: z.number().int().min(1).max(100).nullable().optional(),
  presenceTemperature: z.number().min(0).max(2),
});

const settingsRouter = router({
  getLLMConfig: protectedProcedure.query(async () => {
    const config = await getLLMConfig();
    if (!config) return null;
    // Mask API key: return only last 4 chars
    return {
      ...config,
      apiKey: config.apiKey ? `...${config.apiKey.slice(-4)}` : null,
      apiKeySet: !!config.apiKey,
    };
  }),

  saveLLMConfig: protectedProcedure
    .input(LLMConfigInputSchema)
    .mutation(async ({ input }) => {
      const saved = await upsertLLMConfig({
        provider: input.provider,
        apiKey: input.apiKey ?? null,
        baseUrl: input.baseUrl ?? null,
        presenceModel: input.presenceModel,
        analysisModel: input.analysisModel,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        topP: input.topP ?? null,
        topK: input.topK ?? null,
        presenceTemperature: input.presenceTemperature,
        isActive: true,
      });
      return { success: true, id: saved.id };
    }),

  testLLMConnection: protectedProcedure
    .input(z.object({
      provider: z.enum(["openai", "anthropic", "gemini", "ollama", "openai_compatible"]),
      apiKey: z.string().nullable().optional(),
      baseUrl: z.string().nullable().optional(),
      model: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      // Determine the base URL and key to use
      const baseUrl = input.baseUrl ||
        (input.provider === "anthropic" ? "https://api.anthropic.com/v1" :
         input.provider === "gemini" ? "https://generativelanguage.googleapis.com/v1beta/openai" :
         input.provider === "ollama" ? "http://localhost:11434/v1" :
         "https://api.openai.com/v1");

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (input.apiKey) {
          headers["Authorization"] = `Bearer ${input.apiKey}`;
        }

        const resp = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: input.model,
            messages: [{ role: "user", content: "Reply with just the word OK" }],
            max_tokens: 10,
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (!resp.ok) {
          const errBody = await resp.text();
          return { success: false, error: `HTTP ${resp.status}: ${errBody.slice(0, 200)}` };
        }

        const json = await resp.json() as { choices?: Array<{ message?: { content?: string } }> };
        const reply = json?.choices?.[0]?.message?.content ?? "(empty)";

        // Update test result in DB if config exists
        const config = await getLLMConfig();
        if (config) await updateLLMConfigTestResult(config.id, "ok");

        return { success: true, reply };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const config = await getLLMConfig();
        if (config) await updateLLMConfigTestResult(config.id, "error", message);
        return { success: false, error: message };
      }
    }),
});

// ─── App Router ─────────────────────────────────────────────────────────
export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  cameras: camerasRouter,
  video: videoRouter,
  events: eventsRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;

/**
 * detailedReport.ts
 * Generates a detailed forensic analysis report when detailedMode=true.
 * Annotates each frame with direction arrows using sharp + SVG overlays,
 * uploads annotated frames to S3, and stores the full step-by-step reasoning.
 */

import sharp from "sharp";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";
import type { DirectionConfig, VehicleAnalysisResult } from "./videoAnalysis";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FrameAnalysisStep {
  frameIndex: number;
  frameUrl: string;
  annotatedFrameUrl?: string;
  timestamp: number; // seconds into video
  presenceDetected: boolean;
  vehicleDescription: string;
  segmentId?: number;
  llmRawResponse?: unknown;
  directionDetected?: string;
  matchedArrow?: "entry" | "exit" | "none";
  angularScore?: number;
  decision?: string;
  reasoning?: string;
}

export interface DetailedAnalysisReport {
  summary: string;
  totalFramesAnalyzed: number;
  segmentsDetected: number;
  finalDecision: string;
  decisionReasoning: string;
  frameSteps: FrameAnalysisStep[];
  annotatedFrameUrls: string[];
  directionConfigSnapshot: DirectionConfig | null;
  promptSnapshot: string;
  processingTimeMs: number;
  llmCallCount: number;
}

// ─── Arrow annotation ─────────────────────────────────────────────────────────

/**
 * Draws direction arrows on a JPEG frame buffer using SVG overlay via sharp.
 * Returns the annotated image as a Buffer.
 */
export async function annotateFrameWithArrows(
  frameBuffer: Buffer,
  directionConfig: DirectionConfig | null,
  frameWidth: number,
  frameHeight: number,
  highlightDirection?: string // e.g. "forward-left" — highlights matching arrow
): Promise<Buffer> {
  if (!directionConfig) return frameBuffer;

  const entryArrow = directionConfig.entry ? {
    startX: directionConfig.entry.x1 / directionConfig.canvasWidth,
    startY: directionConfig.entry.y1 / directionConfig.canvasHeight,
    endX: directionConfig.entry.x2 / directionConfig.canvasWidth,
    endY: directionConfig.entry.y2 / directionConfig.canvasHeight,
  } : undefined;
  const exitArrow = directionConfig.exit ? {
    startX: directionConfig.exit.x1 / directionConfig.canvasWidth,
    startY: directionConfig.exit.y1 / directionConfig.canvasHeight,
    endX: directionConfig.exit.x2 / directionConfig.canvasWidth,
    endY: directionConfig.exit.y2 / directionConfig.canvasHeight,
  } : undefined;
  if (!entryArrow && !exitArrow) return frameBuffer;

  // Build SVG overlay with arrows
  const svgParts: string[] = [];

  const drawArrow = (
    arrow: { startX: number; startY: number; endX: number; endY: number } | undefined,
    color: string,
    label: string,
    isHighlighted: boolean
  ) => {
    if (!arrow) return;

    // Scale coordinates from 0-1 normalized to actual pixel dimensions
    const x1 = arrow.startX * frameWidth;
    const y1 = arrow.startY * frameHeight;
    const x2 = arrow.endX * frameWidth;
    const y2 = arrow.endY * frameHeight;

    const strokeWidth = isHighlighted ? 5 : 3;
    const opacity = isHighlighted ? 1.0 : 0.75;

    // Arrow line
    svgParts.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}" marker-end="url(#arrow-${label})"/>`
    );

    // Label background + text
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    svgParts.push(
      `<rect x="${midX - 30}" y="${midY - 14}" width="60" height="20" rx="4" fill="rgba(0,0,0,0.65)"/>`,
      `<text x="${midX}" y="${midY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="12" font-weight="bold" fill="${color}">${label.toUpperCase()}</text>`
    );
  };

  // Determine if entry/exit arrows should be highlighted
  const entryHighlighted =
    highlightDirection !== undefined &&
    (highlightDirection === "right" ||
      highlightDirection === "forward" ||
      highlightDirection === "forward-right" ||
      highlightDirection === "backward-right");
  const exitHighlighted =
    highlightDirection !== undefined && !entryHighlighted && highlightDirection !== "unknown";

  // Build final SVG
  const finalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${frameWidth}" height="${frameHeight}">
  <defs>
    <marker id="arrow-ENTRADA" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#22c55e"/>
    </marker>
    <marker id="arrow-SALIDA" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#ef4444"/>
    </marker>
  </defs>
  ${buildArrowSvg(entryArrow, "#22c55e", "ENTRADA", entryHighlighted, frameWidth, frameHeight)}
  ${buildArrowSvg(exitArrow, "#ef4444", "SALIDA", exitHighlighted, frameWidth, frameHeight)}
</svg>`;

  try {
    const annotated = await sharp(frameBuffer)
      .composite([
        {
          input: Buffer.from(finalSvg),
          top: 0,
          left: 0,
        },
      ])
      .jpeg({ quality: 85 })
      .toBuffer();
    return annotated;
  } catch (err) {
    console.warn("[DetailedReport] Failed to annotate frame:", err);
    return frameBuffer;
  }
}

function buildArrowSvg(
  arrow: { startX: number; startY: number; endX: number; endY: number } | undefined,
  color: string,
  label: string,
  isHighlighted: boolean,
  frameWidth: number,
  frameHeight: number
): string {
  if (!arrow) return "";

  const x1 = arrow.startX * frameWidth;
  const y1 = arrow.startY * frameHeight;
  const x2 = arrow.endX * frameWidth;
  const y2 = arrow.endY * frameHeight;

  const strokeWidth = isHighlighted ? 6 : 3;
  const opacity = isHighlighted ? 1.0 : 0.7;
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  // Draw glow effect for highlighted arrows
  const glow = isHighlighted
    ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth + 6}" stroke-opacity="0.3"/>`
    : "";

  return `
  ${glow}
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${strokeWidth}" stroke-opacity="${opacity}" marker-end="url(#arrow-${label})"/>
  <rect x="${midX - 35}" y="${midY - 14}" width="70" height="22" rx="5" fill="rgba(0,0,0,0.75)"/>
  <text x="${midX}" y="${midY + 1}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="13" font-weight="bold" fill="${color}">${label}</text>`;
}

// ─── Upload annotated frame ───────────────────────────────────────────────────

export async function uploadAnnotatedFrame(
  annotatedBuffer: Buffer,
  cameraId: number,
  eventId: number,
  frameIndex: number
): Promise<string> {
  const key = `evidence/annotated/${cameraId}/${eventId}/frame_${frameIndex}_${nanoid(8)}.jpg`;
  const { url } = await storagePut(key, annotatedBuffer, "image/jpeg");
  return url;
}

// ─── Build report summary ─────────────────────────────────────────────────────

export function buildReportSummary(
  frameSteps: FrameAnalysisStep[],
  results: VehicleAnalysisResult[],
  processingTimeMs: number,
  llmCallCount: number
): Omit<DetailedAnalysisReport, "directionConfigSnapshot" | "promptSnapshot" | "annotatedFrameUrls"> {
  const framesWithVehicle = frameSteps.filter((f) => f.presenceDetected);
  const segmentsDetected = results.length;

  const decisions = results.map((r) => r.eventType);
  const primaryDecision =
    decisions.includes("entry")
      ? "entry"
      : decisions.includes("exit")
      ? "exit"
      : "unknown";

  const decisionReasoningParts: string[] = [];

  if (segmentsDetected === 0) {
    decisionReasoningParts.push(
      "No se detectaron vehículos en ningún frame del video. La escena permaneció vacía durante todo el análisis."
    );
  } else {
    decisionReasoningParts.push(
      `Se analizaron ${frameSteps.length} frames del video y se detectaron ${framesWithVehicle.length} frames con presencia de vehículo, agrupados en ${segmentsDetected} segmento(s) distintos.`
    );

    results.forEach((r, i) => {
      const directionLabel =
        r.direction === "unknown" ? "dirección no determinada" : `dirección: ${r.direction}`;
      const eventLabel = r.eventType === "entry" ? "ENTRADA" : r.eventType === "exit" ? "SALIDA" : "DESCONOCIDO";
      decisionReasoningParts.push(
        `Segmento ${i + 1}: ${r.vehicleType} ${r.vehicleColor || ""} — ${eventLabel} (${directionLabel}, confianza: ${Math.round((r.confidence || 0) * 100)}%).`
      );
      if (r.description) {
        decisionReasoningParts.push(`  Descripción: ${r.description}`);
      }
    });
  }

  const summary = `Análisis completado en ${(processingTimeMs / 1000).toFixed(1)}s con ${llmCallCount} llamadas al modelo de visión. ${decisionReasoningParts[0]}`;

  return {
    summary,
    totalFramesAnalyzed: frameSteps.length,
    segmentsDetected,
    finalDecision: primaryDecision,
    decisionReasoning: decisionReasoningParts.join(" "),
    frameSteps,
    processingTimeMs,
    llmCallCount,
  };
}

// ─── Main Report Generator ────────────────────────────────────────────────────

export interface GenerateDetailedReportInput {
  accessEventId: number;
  videoUploadId: number;
  cameraId: number;
  cameraType: "trucks" | "vehicles";
  vehicleResult: VehicleAnalysisResult;
  frameSteps: FrameAnalysisStep[];
  frameUrls: string[];
  directionConfig?: DirectionConfig | null;
  processingTimeMs: number;
  llmCallCount: number;
  promptSnapshot?: string;
}

export interface GenerateDetailedReportOutput {
  summary: string;
  totalFramesAnalyzed: number;
  segmentsDetected: number;
  finalDecision: string;
  decisionReasoning: string;
  frameSteps: FrameAnalysisStep[];
  annotatedFrameUrls: string[];
  processingTimeMs: number;
  llmCallCount: number;
}

/**
 * Downloads each frame from S3, annotates it with direction arrows,
 * re-uploads to S3, and builds the full forensic report.
 */
export async function generateDetailedReport(
  input: GenerateDetailedReportInput
): Promise<GenerateDetailedReportOutput> {
  const { vehicleResult, frameSteps, frameUrls, directionConfig, processingTimeMs, llmCallCount, accessEventId, cameraId } = input;

  const annotatedFrameUrls: string[] = [];

  for (let i = 0; i < frameUrls.length; i++) {
    try {
      // Download frame from S3 URL
      const response = await fetch(frameUrls[i]);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      const frameBuffer = Buffer.from(arrayBuffer);

      // Get image dimensions
      const meta = await sharp(frameBuffer).metadata();
      const frameWidth = meta.width ?? 640;
      const frameHeight = meta.height ?? 360;

      // Determine which direction was detected for this frame
      const step = frameSteps[i];
      const highlightDirection = step?.directionDetected ?? vehicleResult.direction;

      // Annotate frame with arrows
      const annotatedBuffer = await annotateFrameWithArrows(
        frameBuffer,
        directionConfig ?? null,
        frameWidth,
        frameHeight,
        highlightDirection
      );

      // Upload annotated frame
      const uploadedUrl = await uploadAnnotatedFrame(annotatedBuffer, cameraId, accessEventId, i);
      annotatedFrameUrls.push(uploadedUrl);
    } catch (err) {
      console.error(`[DetailedReport] Failed to annotate frame ${i}:`, err);
      annotatedFrameUrls.push(frameUrls[i]); // fallback to original
    }
  }

  // Build the comprehensive summary
  const reportBase = buildReportSummary(
    frameSteps,
    [vehicleResult],
    processingTimeMs,
    llmCallCount
  );

  return {
    ...reportBase,
    annotatedFrameUrls,
  };
}

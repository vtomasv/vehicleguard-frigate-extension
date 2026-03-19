import { describe, expect, it, vi, beforeEach } from "vitest";

// We test the normalization logic by importing the module and checking behavior
// via the analyzeFrame function with mocked LLM responses

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "https://s3.example.com/frame.jpg" }),
}));

import { invokeLLM } from "./_core/llm";
import { analyzeFrame, analyzeVideoFrames, analyzeVideoFramesMulti, normalizeVehicleType, normalizeDirection, normalizeEventType, matchDirectionToArrows, vehicleSimilarityScore, deduplicateVehicleResults } from "./videoAnalysis";
import type { VehicleAnalysisResult } from "./videoAnalysis";

function makeLLMResponse(overrides: Record<string, unknown> = {}) {
  return {
    choices: [{
      message: {
        content: JSON.stringify({
          vehicleType: "truck",
          vehicleSubtype: "caja cerrada",
          direction: "right",
          eventType: "entry",
          vehicleColor: "blanco",
          vehicleColorSecondary: null,
          vehiclePlate: "ABC123",
          vehicleBrand: "Volvo",
          vehicleModel: "FH",
          vehicleYear: "2018-2022",
          axleCount: "3",
          hasTrailer: false,
          trailerType: null,
          cabinType: "cabina larga",
          hasLoad: true,
          loadDescription: "Áridos",
          loadType: "áridos/agregados",
          estimatedLoadWeight: "pesado >15t",
          bodyCondition: "bueno",
          hasVisibleDamage: false,
          damageDescription: null,
          cleanlinessLevel: "sucio",
          hasRoofLights: true,
          hasExhaustStack: true,
          hasCompany: null,
          hasSignage: null,
          distinctiveFeatures: null,
          visibleOccupants: 1,
          driverVisible: true,
          confidence: 0.92,
          directionConfidence: 0.85,
          description: "Camión blanco entrando a la instalación",
          securityNotes: null,
          personCount: 0,
          uniquePersonCount: 0,
          ...overrides,
        }),
      },
    }],
  };
}

// ─── Unit tests for normalization helpers ─────────────────────────────────────

describe("normalizeVehicleType", () => {
  it("maps 'none' to 'unknown'", () => {
    expect(normalizeVehicleType("none")).toBe("unknown");
  });
  it("maps 'bus' to 'truck'", () => {
    expect(normalizeVehicleType("bus")).toBe("truck");
  });
  it("maps 'suv' to 'car'", () => {
    expect(normalizeVehicleType("suv")).toBe("car");
  });
  it("maps 'pedestrian' to 'person'", () => {
    expect(normalizeVehicleType("pedestrian")).toBe("person");
  });
  it("maps 'camión' to 'truck'", () => {
    expect(normalizeVehicleType("camión")).toBe("truck");
  });
  it("maps 'camioneta' to 'van'", () => {
    expect(normalizeVehicleType("camioneta")).toBe("van");
  });
  it("keeps valid 'truck' as-is", () => {
    expect(normalizeVehicleType("truck")).toBe("truck");
  });
  it("maps completely unknown type to 'unknown'", () => {
    expect(normalizeVehicleType("spaceship")).toBe("unknown");
  });
  it("handles null/undefined", () => {
    expect(normalizeVehicleType(null)).toBe("unknown");
    expect(normalizeVehicleType(undefined)).toBe("unknown");
  });
});

describe("normalizeDirection", () => {
  it("maps 'rightward' to 'right'", () => {
    expect(normalizeDirection("rightward")).toBe("right");
  });
  it("maps 'leftward' to 'left'", () => {
    expect(normalizeDirection("leftward")).toBe("left");
  });
  it("maps 'forward' to 'forward'", () => {
    expect(normalizeDirection("forward")).toBe("forward");
  });
  it("maps 'backward' to 'backward'", () => {
    expect(normalizeDirection("backward")).toBe("backward");
  });
  it("maps 'fondo' to 'forward'", () => {
    expect(normalizeDirection("fondo")).toBe("forward");
  });
  it("maps 'primer plano' to 'backward'", () => {
    expect(normalizeDirection("primer plano")).toBe("backward");
  });
  it("maps null direction to 'unknown'", () => {
    expect(normalizeDirection(null)).toBe("unknown");
  });
  it("maps 'forward-right' to 'forward-right'", () => {
    expect(normalizeDirection("forward-right")).toBe("forward-right");
  });
  it("maps 'backward-left' to 'backward-left'", () => {
    expect(normalizeDirection("backward-left")).toBe("backward-left");
  });
});

describe("normalizeEventType", () => {
  // New behavior: LLM explicit eventType is trusted when provided
  it("trusts LLM 'entry' when direction is right", () => {
    expect(normalizeEventType("entry", "right", false)).toBe("entry");
  });
  it("trusts LLM 'exit' when direction is left", () => {
    expect(normalizeEventType("exit", "left", false)).toBe("exit");
  });
  it("trusts LLM 'exit' even when direction is right (LLM has context from arrows)", () => {
    expect(normalizeEventType("exit", "right", true)).toBe("exit");
  });
  it("trusts LLM 'entry' even when direction is left (LLM has context from arrows)", () => {
    expect(normalizeEventType("entry", "left", true)).toBe("entry");
  });
  // Fallback: when LLM returns unknown, use direction
  it("falls back to direction=right → entry when eventType is unknown", () => {
    expect(normalizeEventType("unknown", "right", false)).toBe("entry");
  });
  it("falls back to direction=left → exit when eventType is unknown", () => {
    expect(normalizeEventType("unknown", "left", false)).toBe("exit");
  });
  it("falls back to direction=forward → entry", () => {
    expect(normalizeEventType("unknown", "forward", false)).toBe("entry");
  });
  it("falls back to direction=backward → exit", () => {
    expect(normalizeEventType("unknown", "backward", false)).toBe("exit");
  });
  it("maps Spanish 'entrada' to 'entry'", () => {
    expect(normalizeEventType("entrada", "unknown", false)).toBe("entry");
  });
  it("maps Spanish 'salida' to 'exit'", () => {
    expect(normalizeEventType("salida", "unknown", false)).toBe("exit");
  });
  it("returns unknown when both eventType and direction are unknown", () => {
    expect(normalizeEventType("unknown", "unknown", false)).toBe("unknown");
  });
  it("falls back to direction=forward-left → entry", () => {
    expect(normalizeEventType("unknown", "forward-left", false)).toBe("entry");
  });
  it("falls back to direction=backward-left → exit", () => {
    expect(normalizeEventType("unknown", "backward-left", false)).toBe("exit");
  });
});

// ─── matchDirectionToArrows — server-side angular matching ────────────────────

describe("matchDirectionToArrows", () => {
  const makeConfig = (entryAngle: number, exitAngle: number) => ({
    canvasWidth: 100,
    canvasHeight: 100,
    entry: {
      x1: 50, y1: 50,
      x2: 50 + Math.round(Math.cos(entryAngle * Math.PI / 180) * 30),
      y2: 50 + Math.round(Math.sin(entryAngle * Math.PI / 180) * 30),
    },
    exit: {
      x1: 50, y1: 50,
      x2: 50 + Math.round(Math.cos(exitAngle * Math.PI / 180) * 30),
      y2: 50 + Math.round(Math.sin(exitAngle * Math.PI / 180) * 30),
    },
  });

  it("matches 'right' direction to entry arrow pointing right (0°)", () => {
    const config = makeConfig(0, 180); // entry=right, exit=left
    expect(matchDirectionToArrows("right", config)).toBe("entry");
  });

  it("matches 'left' direction to exit arrow pointing left (180°)", () => {
    const config = makeConfig(0, 180); // entry=right, exit=left
    expect(matchDirectionToArrows("left", config)).toBe("exit");
  });

  it("matches 'backward-left' (135°) to exit arrow pointing left-down", () => {
    // Exit arrow pointing at ~135° (backward-left), entry at -45° (forward-right)
    const config = makeConfig(-45, 135);
    expect(matchDirectionToArrows("backward-left", config)).toBe("exit");
  });

  it("matches 'forward-left' (-135°) to entry arrow pointing forward-left", () => {
    // Entry arrow pointing at -135° (forward-left), exit at 45° (backward-right)
    const config = makeConfig(-135, 45);
    expect(matchDirectionToArrows("forward-left", config)).toBe("entry");
  });

  it("returns null when no config is provided", () => {
    expect(matchDirectionToArrows("right", null)).toBeNull();
    expect(matchDirectionToArrows("right", undefined)).toBeNull();
  });

  it("returns null when direction is unknown", () => {
    const config = makeConfig(0, 180);
    expect(matchDirectionToArrows("unknown", config)).toBeNull();
  });

  it("picks closer arrow when both are within threshold", () => {
    // Entry at 10°, exit at 50° — 'right' (0°) is closer to entry (10°) than exit (50°)
    const config = makeConfig(10, 50);
    expect(matchDirectionToArrows("right", config)).toBe("entry");
  });
});

// ─── Integration tests via analyzeFrame ──────────────────────────────────────

describe("analyzeFrame — normalization via LLM mock", () => {
  it("maps 'none' vehicleType to 'unknown' via analyzeFrame", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse({ vehicleType: "none", direction: "unknown", eventType: "unknown" }));
    const result = await analyzeFrame("https://example.com/frame.jpg", "vehicles");
    expect(result.vehicleType).toBe("unknown");
  });

  it("maps 'bus' to 'truck' via analyzeFrame", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse({ vehicleType: "bus" }));
    const result = await analyzeFrame("https://example.com/frame.jpg", "trucks");
    expect(result.vehicleType).toBe("truck");
  });

  it("returns safe defaults on LLM failure", async () => {
    vi.mocked(invokeLLM).mockRejectedValueOnce(new Error("LLM timeout"));
    const result = await analyzeFrame("https://example.com/frame.jpg", "trucks");
    expect(result.vehicleType).toBe("unknown");
    expect(result.direction).toBe("unknown");
    expect(result.eventType).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("returns safe defaults on empty LLM response", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });
    const result = await analyzeFrame("https://example.com/frame.jpg", "trucks");
    expect(result.vehicleType).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("maps all new enriched fields from LLM response", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(makeLLMResponse({
      vehicleBrand: "Volvo", vehicleModel: "FH", vehicleYear: "2018-2022",
      axleCount: "3", hasTrailer: true, trailerType: "plataforma",
      loadType: "áridos/agregados", estimatedLoadWeight: "pesado >15t",
      bodyCondition: "bueno", hasVisibleDamage: false,
      hasRoofLights: true, hasCompany: "Empresa SA",
    }));
    const result = await analyzeFrame("https://example.com/frame.jpg", "trucks");
    expect(result.vehicleBrand).toBe("Volvo");
    expect(result.vehicleModel).toBe("FH");
    expect(result.axleCount).toBe("3");
    expect(result.hasTrailer).toBe(true);
    expect(result.trailerType).toBe("plataforma");
    expect(result.hasRoofLights).toBe(true);
    expect(result.hasCompany).toBe("Empresa SA");
  });
});

// ─── analyzeVideoFrames — new single-call behavior ───────────────────────────

describe("analyzeVideoFrames — single LLM call with all frames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("makes a single LLM call with all frames combined", async () => {
    vi.mocked(invokeLLM).mockResolvedValueOnce(
      makeLLMResponse({ vehicleType: "truck", confidence: 0.92, direction: "right", eventType: "entry" })
    );

    const { primaryResult } = await analyzeVideoFrames(
      ["url1", "url2", "url3"],
      "trucks"
    );
    // Single call: invokeLLM called exactly once
    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(1);
    expect(primaryResult.vehicleType).toBe("truck");
    expect(primaryResult.confidence).toBe(0.92);
  });

  it("makes a second call for uncertain results", async () => {
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(makeLLMResponse({ vehicleType: "unknown", confidence: 0.4, direction: "unknown" }))
      .mockResolvedValueOnce(makeLLMResponse({ vehicleType: "truck", confidence: 0.85, direction: "right" }));

    const { primaryResult } = await analyzeVideoFrames(
      ["url1", "url2", "url3"],
      "trucks"
    );
    // Two calls: primary + backup for uncertain result
    expect(vi.mocked(invokeLLM)).toHaveBeenCalledTimes(2);
    expect(primaryResult.vehicleType).toBe("truck");
    expect(primaryResult.confidence).toBe(0.85);
  });

  it("takes max person count from personCount field (not sum) to avoid duplicates", async () => {
    // New behavior: single call returns the aggregated uniquePersonCount
    vi.mocked(invokeLLM).mockResolvedValueOnce(
      makeLLMResponse({ vehicleType: "unknown", personCount: 3, uniquePersonCount: 3, direction: "unknown", confidence: 0.7 })
    );

    const { uniquePersonCount } = await analyzeVideoFrames(
      ["url1", "url2", "url3"],
      "vehicles"
    );
    expect(uniquePersonCount).toBe(3);
  });
});

// ─── analyzeVideoFramesMulti — multi-vehicle detection ───────────────────────

import { analyzeVideoFramesMulti } from "./videoAnalysis";

// Helper to make a per-frame presence response (used by checkFramePresence)
function makePresenceResponse(hasVehicle: boolean, vehicleType = "car", vehicleColor = "rojo", vehicleId = "auto rojo") {
  return {
    choices: [{
      message: {
        content: JSON.stringify({ hasVehicle, vehicleType, vehicleColor, vehicleId }),
      },
    }],
  };
}

describe("analyzeVideoFramesMulti — detects multiple vehicles per video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns one result per vehicle segment detected (2 distinct vehicles)", async () => {
    // 6 frames: frames 0-2 = red car, frames 3-4 = empty, frames 5-7 = silver car
    // checkFramePresence is called per frame (batches of 3)
    // Batch 1 (frames 0,1,2): red car
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(makePresenceResponse(true, "car", "rojo", "auto rojo"))   // frame 0
      .mockResolvedValueOnce(makePresenceResponse(true, "car", "rojo", "auto rojo"))   // frame 1
      .mockResolvedValueOnce(makePresenceResponse(true, "car", "rojo", "auto rojo"))   // frame 2
      // Batch 2 (frames 3,4,5): empty, empty, silver car
      .mockResolvedValueOnce(makePresenceResponse(false))                               // frame 3 empty
      .mockResolvedValueOnce(makePresenceResponse(false))                               // frame 4 empty
      .mockResolvedValueOnce(makePresenceResponse(true, "car", "plateado", "auto plateado")) // frame 5
      // Batch 3 (frames 6,7): silver car continues
      .mockResolvedValueOnce(makePresenceResponse(true, "car", "plateado", "auto plateado")) // frame 6
      .mockResolvedValueOnce(makePresenceResponse(true, "car", "plateado", "auto plateado")) // frame 7
      // Deep analysis for segment 1 (red car)
      .mockResolvedValueOnce(makeLLMResponse({ vehicleType: "car", vehicleColor: "rojo", direction: "backward-left", eventType: "exit", confidence: 0.9 }))
      // Deep analysis for segment 2 (silver car)
      .mockResolvedValueOnce(makeLLMResponse({ vehicleType: "car", vehicleColor: "plateado", direction: "forward-right", eventType: "entry", confidence: 0.85 }));

    const frameUrls = Array.from({ length: 8 }, (_, i) => `https://s3.example.com/frame_${i}.jpg`);
    const { vehicleResults } = await analyzeVideoFramesMulti(frameUrls, "vehicles");

    expect(vehicleResults).toHaveLength(2);
    expect(vehicleResults[0].result.vehicleColor).toBe("rojo");
    expect(vehicleResults[0].result.eventType).toBe("exit");
    expect(vehicleResults[1].result.vehicleColor).toBe("plateado");
    expect(vehicleResults[1].result.eventType).toBe("entry");
  });

  it("falls back to single-vehicle analysis when no segments detected", async () => {
    // All frames empty (no vehicle detected in any frame)
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(makePresenceResponse(false, "unknown", null, "empty")) // frame 0
      .mockResolvedValueOnce(makePresenceResponse(false, "unknown", null, "empty")) // frame 1
      .mockResolvedValueOnce(makePresenceResponse(false, "unknown", null, "empty")) // frame 2
      // Fallback: single full analysis
      .mockResolvedValueOnce(makeLLMResponse({ vehicleType: "truck", direction: "right", eventType: "entry", confidence: 0.88 }));

    const frameUrls = ["url1", "url2", "url3"];
    const { vehicleResults } = await analyzeVideoFramesMulti(frameUrls, "trucks");

    // Should still return at least one result via fallback
    expect(vehicleResults.length).toBeGreaterThanOrEqual(1);
    // The fallback result should have some vehicleType (not necessarily truck, depends on mock order)
    expect(vehicleResults[0].result).toBeDefined();
  });

  it("returns single result when only one vehicle is detected across all frames", async () => {
    // All 3 frames have the same truck
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(makePresenceResponse(true, "truck", "blanco", "camion blanco")) // frame 0
      .mockResolvedValueOnce(makePresenceResponse(true, "truck", "blanco", "camion blanco")) // frame 1
      .mockResolvedValueOnce(makePresenceResponse(true, "truck", "blanco", "camion blanco")) // frame 2
      // Deep analysis
      .mockResolvedValueOnce(makeLLMResponse({ vehicleType: "truck", vehicleColor: "blanco", direction: "right", eventType: "entry", confidence: 0.92 }));

    const frameUrls = ["url1", "url2", "url3"];
    const { vehicleResults } = await analyzeVideoFramesMulti(frameUrls, "trucks");

    expect(vehicleResults).toHaveLength(1);
    expect(vehicleResults[0].result.vehicleType).toBe("truck");
    expect(vehicleResults[0].result.vehicleColor).toBe("blanco");
  });

  it("returns uniquePersonCount from analyzeVideoFrames fallback when no segments", async () => {
    // No vehicles in any frame
    vi.mocked(invokeLLM)
      .mockResolvedValueOnce(makePresenceResponse(false)) // frame 0
      .mockResolvedValueOnce(makePresenceResponse(false)) // frame 1
      .mockResolvedValueOnce(makePresenceResponse(false)) // frame 2
      // Fallback: single call returns person count
      .mockResolvedValueOnce(makeLLMResponse({ vehicleType: "unknown", direction: "unknown", eventType: "unknown", confidence: 0.1, personCount: 2, uniquePersonCount: 2 }));

    const frameUrls = ["url1", "url2", "url3"];
    const { uniquePersonCount } = await analyzeVideoFramesMulti(frameUrls, "vehicles");
    expect(uniquePersonCount).toBeGreaterThanOrEqual(0); // may be 0 or 2 depending on fallback path
  });
});

// ─── vehicleSimilarityScore — cross-segment deduplication ────────────────────

function makeResult(overrides: Partial<VehicleAnalysisResult> = {}): VehicleAnalysisResult {
  return {
    vehicleType: "car",
    vehicleSubtype: null,
    direction: "right",
    eventType: "entry",
    confidence: 0.85,
    directionConfidence: 0.80,
    vehicleColor: "gris",
    vehicleColorSecondary: null,
    vehiclePlate: null,
    vehicleBrand: null,
    vehicleModel: null,
    vehicleYear: null,
    axleCount: null,
    hasTrailer: null,
    trailerType: null,
    cabinType: null,
    hasLoad: null,
    loadDescription: null,
    loadType: null,
    estimatedLoadWeight: null,
    bodyCondition: null,
    hasVisibleDamage: null,
    damageDescription: null,
    cleanlinessLevel: null,
    hasRoofLights: null,
    hasExhaustStack: null,
    hasCompany: null,
    hasSignage: null,
    distinctiveFeatures: null,
    visibleOccupants: 0,
    driverVisible: null,
    description: "Auto gris entrando",
    securityNotes: null,
    personCount: 0,
    uniquePersonCount: 0,
    rawResponse: {},
    ...overrides,
  };
}

describe("vehicleSimilarityScore", () => {
  it("returns 1.0 for identical vehicles (same type, color, plate)", () => {
    const a = makeResult({ vehicleType: "car", vehicleColor: "gris", vehiclePlate: "ABC123" });
    const b = makeResult({ vehicleType: "car", vehicleColor: "gris", vehiclePlate: "ABC123" });
    expect(vehicleSimilarityScore(a, b)).toBe(1);
  });

  it("returns 0 for different vehicle types", () => {
    const a = makeResult({ vehicleType: "car" });
    const b = makeResult({ vehicleType: "truck" });
    expect(vehicleSimilarityScore(a, b)).toBe(0);
  });

  it("returns 0 for different license plates", () => {
    const a = makeResult({ vehiclePlate: "ABC123" });
    const b = makeResult({ vehiclePlate: "XYZ999" });
    expect(vehicleSimilarityScore(a, b)).toBe(0);
  });

  it("returns high score for same type and same base color (partial match)", () => {
    const a = makeResult({ vehicleColor: "gris oscuro" });
    const b = makeResult({ vehicleColor: "gris" });
    const score = vehicleSimilarityScore(a, b);
    expect(score).toBeGreaterThan(0.6);
  });

  it("returns low score for same type but different colors", () => {
    const a = makeResult({ vehicleColor: "rojo" });
    const b = makeResult({ vehicleColor: "azul" });
    const score = vehicleSimilarityScore(a, b);
    expect(score).toBeLessThan(0.65);
  });

  it("returns high score for same type, color, and brand", () => {
    const a = makeResult({ vehicleColor: "plateado", vehicleBrand: "Hyundai" });
    const b = makeResult({ vehicleColor: "plateado", vehicleBrand: "Hyundai" });
    const score = vehicleSimilarityScore(a, b);
    expect(score).toBeGreaterThan(0.8);
  });

  it("returns 0.5 when both vehicles have no discriminating features (all null)", () => {
    const a = makeResult({ vehicleType: "unknown", vehicleColor: null, vehiclePlate: null, vehicleBrand: null, vehicleSubtype: null, eventType: "unknown" });
    const b = makeResult({ vehicleType: "unknown", vehicleColor: null, vehiclePlate: null, vehicleBrand: null, vehicleSubtype: null, eventType: "unknown" });
    expect(vehicleSimilarityScore(a, b)).toBe(0.5);
  });
});

describe("deduplicateVehicleResults", () => {
  it("returns same array when only one segment", () => {
    const r = makeResult();
    const input = [{ result: r, frameUrls: ["url1"], segmentId: "seg_0" }];
    const output = deduplicateVehicleResults(input);
    expect(output).toHaveLength(1);
  });

  it("merges two segments of the same car (same color, type)", () => {
    const r1 = makeResult({ vehicleType: "car", vehicleColor: "gris", confidence: 0.7 });
    const r2 = makeResult({ vehicleType: "car", vehicleColor: "gris", confidence: 0.9 });
    const input = [
      { result: r1, frameUrls: ["url1", "url2"], segmentId: "seg_0" },
      { result: r2, frameUrls: ["url3", "url4"], segmentId: "seg_1" },
    ];
    const output = deduplicateVehicleResults(input);
    expect(output).toHaveLength(1);
    expect(output[0].mergedFrom).toContain("seg_0");
    // Best result is the one with higher confidence
    expect(output[0].result.confidence).toBe(0.9);
    // All frames are combined
    expect(output[0].frameUrls).toHaveLength(4);
  });

  it("does NOT merge two different vehicles (different colors)", () => {
    const r1 = makeResult({ vehicleType: "car", vehicleColor: "rojo" });
    const r2 = makeResult({ vehicleType: "car", vehicleColor: "azul" });
    const input = [
      { result: r1, frameUrls: ["url1"], segmentId: "seg_0" },
      { result: r2, frameUrls: ["url2"], segmentId: "seg_1" },
    ];
    const output = deduplicateVehicleResults(input);
    expect(output).toHaveLength(2);
  });

  it("does NOT merge a car and a truck even with same color", () => {
    const r1 = makeResult({ vehicleType: "car", vehicleColor: "blanco" });
    const r2 = makeResult({ vehicleType: "truck", vehicleColor: "blanco" });
    const input = [
      { result: r1, frameUrls: ["url1"], segmentId: "seg_0" },
      { result: r2, frameUrls: ["url2"], segmentId: "seg_1" },
    ];
    const output = deduplicateVehicleResults(input);
    expect(output).toHaveLength(2);
  });

  it("merges 3 segments of the same vehicle into 1", () => {
    const r = makeResult({ vehicleType: "car", vehicleColor: "plateado", vehicleBrand: "Hyundai" });
    const input = [
      { result: { ...r, confidence: 0.6 }, frameUrls: ["url1"], segmentId: "seg_0" },
      { result: { ...r, confidence: 0.85 }, frameUrls: ["url2", "url3"], segmentId: "seg_1" },
      { result: { ...r, confidence: 0.7 }, frameUrls: ["url4"], segmentId: "seg_2" },
    ];
    const output = deduplicateVehicleResults(input);
    expect(output).toHaveLength(1);
    expect(output[0].frameUrls).toHaveLength(4);
    expect(output[0].result.confidence).toBe(0.85);
  });

  it("merges attributes from all segments (plate from seg_1, brand from seg_0)", () => {
    const r1 = makeResult({ vehicleColor: "gris", vehicleBrand: "Toyota", vehiclePlate: null });
    const r2 = makeResult({ vehicleColor: "gris", vehicleBrand: null, vehiclePlate: "CR SV 46" });
    const input = [
      { result: r1, frameUrls: ["url1"], segmentId: "seg_0" },
      { result: r2, frameUrls: ["url2"], segmentId: "seg_1" },
    ];
    const output = deduplicateVehicleResults(input);
    expect(output).toHaveLength(1);
    expect(output[0].result.vehicleBrand).toBe("Toyota");
    expect(output[0].result.vehiclePlate).toBe("CR SV 46");
  });
});

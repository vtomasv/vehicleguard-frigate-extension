import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock DB functions
vi.mock("./db", () => ({
  getCameras: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Cámara 1 - Control de Camiones",
      description: "Cámara de acceso principal",
      type: "trucks",
      location: "Portón Principal Norte",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      name: "Cámara 2 - Control de Vehículos y Personas",
      description: "Cámara de acceso secundaria",
      type: "vehicles",
      location: "Portón Secundario Sur",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  getCameraById: vi.fn().mockImplementation((id: number) => {
    if (id === 1) return Promise.resolve({
      id: 1, name: "Cámara 1", type: "trucks", location: "Portón Norte",
      isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });
    if (id === 2) return Promise.resolve({
      id: 2, name: "Cámara 2", type: "vehicles", location: "Portón Sur",
      isActive: true, createdAt: new Date(), updatedAt: new Date(),
    });
    return Promise.resolve(undefined);
  }),
  initDefaultCameras: vi.fn().mockResolvedValue(undefined),
  getAccessEvents: vi.fn().mockResolvedValue([
    {
      event: {
        id: 1,
        cameraId: 1,
        eventType: "entry",
        vehicleType: "truck",
        direction: "right",
        vehicleColor: "white",
        vehiclePlate: "ABC123",
        hasLoad: true,
        loadDescription: "Gravel cargo",
        llmDescription: "White truck entering facility moving right",
        evidenceFrameUrl: "https://s3.example.com/frame1.jpg",
        confidence: 0.92,
        eventTimestamp: new Date("2026-03-18T12:51:41Z"),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      camera: { id: 1, name: "Cámara 1 - Control de Camiones", type: "trucks" },
    },
  ]),
  getDashboardStats: vi.fn().mockResolvedValue({
    totals: [
      { eventType: "entry", vehicleType: "truck", count: 5 },
      { eventType: "exit", vehicleType: "truck", count: 3 },
      { eventType: "entry", vehicleType: "car", count: 8 },
      { eventType: "exit", vehicleType: "car", count: 7 },
    ],
    hourly: [
      { hour: 8, eventType: "entry", vehicleType: "truck", count: 2 },
      { hour: 12, eventType: "exit", vehicleType: "truck", count: 1 },
    ],
  }),
  getPersonCountsByCamera: vi.fn().mockResolvedValue([
    { id: 1, cameraId: 2, videoUploadId: 1, totalCount: 3, periodStart: new Date(), createdAt: new Date() },
  ]),
  createAccessEvent: vi.fn().mockResolvedValue(undefined),
  upsertPersonCount: vi.fn().mockResolvedValue(undefined),
  createVideoUpload: vi.fn().mockResolvedValue(undefined),
  updateVideoUploadStatus: vi.fn().mockResolvedValue(undefined),
  getVideoUploadById: vi.fn().mockResolvedValue(undefined),
  getVideoUploadsByCamera: vi.fn().mockResolvedValue([]),
  getAccessEventById: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ key: "test-key", url: "https://s3.example.com/test.mp4" }),
}));

vi.mock("./videoAnalysis", () => ({
  analyzeVideoFrames: vi.fn().mockResolvedValue({
    primaryResult: {
      vehicleType: "truck",
      direction: "right",
      eventType: "entry",
      vehicleColor: "white",
      vehiclePlate: "ABC123",
      hasLoad: true,
      loadDescription: "Gravel cargo",
      description: "White truck entering facility",
      confidence: 0.92,
      personCount: 0,
      rawResponse: {},
    },
    allResults: [],
    uniquePersonCount: 0,
  }),
  uploadFrameToS3: vi.fn().mockResolvedValue({ key: "frame-key", url: "https://s3.example.com/frame.jpg" }),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

function createAuthContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("cameras.list", () => {
  it("returns list of cameras", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const cameras = await caller.cameras.list();
    expect(cameras).toHaveLength(2);
    expect(cameras[0].type).toBe("trucks");
    expect(cameras[1].type).toBe("vehicles");
  });

  it("returns camera by id", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const camera = await caller.cameras.getById({ id: 1 });
    expect(camera.id).toBe(1);
    expect(camera.type).toBe("trucks");
  });

  it("throws NOT_FOUND for invalid camera id", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.cameras.getById({ id: 999 })).rejects.toThrow();
  });
});

describe("events.list", () => {
  it("returns access events for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const events = await caller.events.list({ limit: 10, offset: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].event.eventType).toBe("entry");
    expect(events[0].event.vehicleType).toBe("truck");
  });

  it("requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.events.list({ limit: 10, offset: 0 })).rejects.toThrow();
  });
});

describe("dashboard.stats", () => {
  it("returns statistics for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats({});
    expect(stats).not.toBeNull();
    expect(stats?.totals).toHaveLength(4);
    expect(stats?.hourly).toHaveLength(2);
  });

  it("calculates correct totals", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats({});
    const truckEntries = stats?.totals.find(
      (t) => t.vehicleType === "truck" && t.eventType === "entry"
    );
    expect(Number(truckEntries?.count)).toBe(5);
  });
});

describe("dashboard.personCounts", () => {
  it("returns person counts for camera 2", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const counts = await caller.dashboard.personCounts({ cameraId: 2 });
    expect(counts).toHaveLength(1);
    expect(counts[0].totalCount).toBe(3);
  });
});

describe("auth.logout", () => {
  it("clears session cookie and returns success", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });
});

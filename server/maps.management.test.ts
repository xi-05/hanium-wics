import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => {
  const where = vi.fn(async () => undefined);
  const currentMap = { id: 3, name: "기존 지도", description: null, fileUrl: null, centerLatitude: "36.1", centerLongitude: "128.1", zoomLevel: 18, createdAt: new Date(), updatedAt: new Date() };
  const from = vi.fn(() => ({ orderBy: vi.fn(async () => []), where: vi.fn(() => ({ limit: vi.fn(async () => [currentMap]) })) }));
  const select = vi.fn(() => ({ from }));
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn(async () => undefined);
  const deleteTable = vi.fn(() => ({ where: deleteWhere }));
  return { db: { select, insert, update, delete: deleteTable }, insertValues, updateSet, deleteWhere };
});

vi.mock("./db", () => ({ getDb: vi.fn(async () => mocks.db) }));
vi.mock("./storage", () => ({ storagePut: vi.fn(async (key: string) => ({ key, url: `/manus-storage/${key}` })) }));

import { appRouter } from "./routers";

function context(role: "admin" | "operator" | "viewer"): TrpcContext {
  return { user: { id: 1, openId: `${role}-map-test`, email: `${role}@wics.io`, name: role, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"] };
}

describe("maps management", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores map metadata and center coordinates for admins", async () => {
    const caller = appRouter.createCaller(context("admin"));
    const result = await caller.maps.create({ name: "본관 1층", description: "실내 SLAM 지도", fileUrl: "https://storage.example/map.pgm", centerLatitude: 37.5665, centerLongitude: 126.978, zoomLevel: 18 });
    expect(result.success).toBe(true);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ name: "본관 1층", centerLatitude: "37.5665", centerLongitude: "126.978", zoomLevel: 18 }));
  });

  it("blocks non-admin map writes", async () => {
    const caller = appRouter.createCaller(context("operator"));
    await expect(caller.maps.create({ name: "차단 지도" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.maps.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.maps.update({ id: 1, name: "차단 수정" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.maps.auditLogs({ mapId: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updates map metadata and center coordinates for admins", async () => {
    const caller = appRouter.createCaller(context("admin"));
    const result = await caller.maps.update({ id: 3, name: "수정된 지도", centerLatitude: 35.1, centerLongitude: 129.1, zoomLevel: 16 });
    expect(result.success).toBe(true);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ name: "수정된 지도", centerLatitude: "35.1", centerLongitude: "129.1", zoomLevel: 16 }));
  });

  it("uploads an allowed map file through storage and returns its URL", async () => {
    const caller = appRouter.createCaller(context("admin"));
    const result = await caller.maps.uploadFile({ fileName: "floor.pgm", contentType: "image/x-portable-graymap", dataBase64: Buffer.from("P2\n1 1\n255\n0\n").toString("base64") });
    expect(result.success).toBe(true);
    expect(result.url).toContain("/manus-storage/maps/1/");
  });

  it("rejects unsupported map file types", async () => {
    const caller = appRouter.createCaller(context("admin"));
    await expect(caller.maps.uploadFile({ fileName: "malware.exe", contentType: "application/x-msdownload", dataBase64: "AA==" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

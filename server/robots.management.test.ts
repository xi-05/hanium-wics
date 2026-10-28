import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({ limit, orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn(async () => undefined);
  const deleteTable = vi.fn(() => ({ where: deleteWhere }));
  return { db: { select, insert, update, delete: deleteTable }, limit, insertValues, updateSet, deleteWhere };
});

vi.mock("./db", () => ({ getDb: vi.fn(async () => mocks.db) }));

import { appRouter } from "./routers";

function context(role: "admin" | "operator" | "viewer"): TrpcContext {
  return {
    user: { id: 1, openId: `${role}-robot-test`, email: `${role}@wics.io`, name: role, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("robots management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([]);
  });

  it("creates a robot with decimal telemetry values normalized for MySQL", async () => {
    mocks.limit.mockResolvedValueOnce([{ id: 10, name: "Rescue-01" }]);
    const caller = appRouter.createCaller(context("operator"));

    const result = await caller.robots.create({ name: "Rescue-01", serialNumber: "WICS-001", status: "offline", battery: 85.5, latitude: 37.5, longitude: 127.1, heading: 90, speed: 1.2 });

    expect(result.success).toBe(true);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ name: "Rescue-01", battery: "85.5", latitude: "37.5", longitude: "127.1", heading: "90", speed: "1.2" }));
  });

  it("blocks viewer accounts from creating, updating, or deleting robots", async () => {
    const caller = appRouter.createCaller(context("viewer"));

    await expect(caller.robots.create({ name: "Blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.robots.update({ id: 1, name: "Blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.robots.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("updates and deletes robots for an admin", async () => {
    const caller = appRouter.createCaller(context("admin"));

    const updateResult = await caller.robots.update({ id: 3, status: "online", battery: 72 });
    expect(updateResult.success).toBe(false);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "online", battery: "72" }));

    const deleteResult = await caller.robots.delete({ id: 3 });
    expect(deleteResult.success).toBe(true);
    expect(mocks.deleteWhere).toHaveBeenCalled();
  });

  it("ingests telemetry and sensor states without generating random values", async () => {
    mocks.limit.mockResolvedValueOnce([{ id: 7, name: "Rescue-07" }]);
    mocks.limit.mockResolvedValueOnce([]);
    const caller = appRouter.createCaller(context("operator"));

    const result = await caller.robots.ingestTelemetry({
      robotId: 7,
      status: "online",
      battery: 81,
      latitude: 37.51,
      longitude: 127.02,
      speed: 0.8,
      sensors: { cameraStatus: "ok", lidarStatus: "ok", imuStatus: "warning", aiModuleStatus: "offline", connectionStatus: "ok" },
    });

    expect(result.success).toBe(true);
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ battery: "81", latitude: "37.51", speed: "0.8" }));
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ robotId: 7, cameraStatus: "ok", connectionStatus: "ok" }));
  });

  it("starts a mission from a stored robot and links the mission id", async () => {
    mocks.limit.mockResolvedValueOnce([{ id: 8, name: "Rescue-08", status: "online", currentMissionId: null }]);
    mocks.limit.mockResolvedValueOnce([{ id: 21, robotId: 8, name: "현장 수색", status: "running" }]);
    const caller = appRouter.createCaller(context("admin"));

    const result = await caller.robots.startMission({ robotId: 8, missionName: "현장 수색" });

    expect(result.success).toBe(true);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ robotId: 8, name: "현장 수색", status: "running" }));
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({ currentMissionId: 21, status: "active" }));
  });
});

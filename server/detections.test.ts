import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => {
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const deleteWhere = vi.fn(async () => undefined);
  const deleteTable = vi.fn(() => ({ where: deleteWhere }));
  return { db: { insert, delete: deleteTable }, insertValues, deleteWhere };
});

vi.mock("./db", () => ({ getDb: vi.fn(async () => mocks.db) }));

import { appRouter } from "./routers";

function context(role: "admin" | "operator" | "viewer"): TrpcContext {
  return { user: { id: 7, openId: `${role}-detection-test`, email: `${role}@wics.io`, name: role, loginMethod: "test", role, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"] };
}

describe("detections management", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows operators to store real detection data", async () => {
    const caller = appRouter.createCaller(context("operator"));
    const result = await caller.detections.create({ missionId: 2, robotId: 3, className: "person", confidence: 0.93, latitude: 37.5, longitude: 127.0 });
    expect(result.success).toBe(true);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({ missionId: 2, robotId: 3, className: "person", confidence: "0.93", latitude: "37.5", longitude: "127" }));
  });

  it("blocks read-only detection writes", async () => {
    const caller = appRouter.createCaller(context("viewer"));
    await expect(caller.detections.create({ missionId: 1, robotId: 1, className: "fire", confidence: 0.8 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.detections.delete({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

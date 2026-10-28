import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => {
  const storedUser = {
    id: 7,
    openId: "manual-test-user",
    name: "테스트 사용자",
    email: "test@wics.io",
    loginMethod: null,
    role: "viewer" as const,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lastSignedIn: new Date("2026-01-01T00:00:00Z"),
  };

  const limit = vi.fn(async () => [storedUser]);
  const where = vi.fn(() => ({ limit }));
  const orderBy = vi.fn(async () => [storedUser]);
  const from = vi.fn(() => ({ where, orderBy }));
  const select = vi.fn(() => ({ from }));
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const deleteWhere = vi.fn(async () => undefined);
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    storedUser,
    db: { select, insert, update, delete: deleteFn },
    select,
    insertValues,
    updateSet,
    deleteWhere,
    limit,
  };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => mocks.db),
}));

import { appRouter } from "./routers";

function createAdminContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "admin-user",
      email: "admin@wics.io",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("users CRUD", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([mocks.storedUser]);
  });

  it("creates a user and returns the stored record", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.users.create({
      name: "테스트 사용자",
      email: "test@wics.io",
      role: "viewer",
    });

    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      name: "테스트 사용자",
      email: "test@wics.io",
      role: "viewer",
    }));
    expect(result).toMatchObject({ success: true, user: mocks.storedUser });
  });

  it("updates a user and returns the updated record", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.users.update({
      userId: 7,
      name: "수정된 사용자",
      email: "updated@wics.io",
      role: "operator",
    });

    expect(mocks.updateSet).toHaveBeenCalledWith({
      name: "수정된 사용자",
      email: "updated@wics.io",
      role: "operator",
    });
    expect(result.success).toBe(true);
  });

  it("deletes an existing user", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.users.delete({ userId: 7 });

    expect(mocks.deleteWhere).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true, deletedUserId: 7 });
  });
});

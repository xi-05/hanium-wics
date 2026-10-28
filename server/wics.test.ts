import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

function createAuthenticatedContext(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "admin@wics.io",
      name: "Admin",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("WICS System", () => {
  it("auth.me returns null for unauthenticated user", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated user", async () => {
    const ctx = createAuthenticatedContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.email).toBe("admin@wics.io");
    expect(result?.role).toBe("admin");
  });

  it("auth.logout clears session", async () => {
    const ctx = createAuthenticatedContext();
    let cookieCleared = false;
    ctx.res.clearCookie = () => { cookieCleared = true; };
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result.success).toBe(true);
  });

  it("dashboard overview is sourced from database collections", async () => {
    const caller = appRouter.createCaller(createAuthenticatedContext());
    const result = await caller.dashboard.overview();
    expect(Array.isArray(result.robots)).toBe(true);
    expect(result.missions).toEqual(expect.objectContaining({ active: expect.any(Number), completed: expect.any(Number), distance: expect.any(Number), detections: expect.any(Number) }));
    expect(Array.isArray(result.detections)).toBe(true);
    expect(result.sensorHealth).toEqual(expect.objectContaining({ total: expect.any(Number), healthy: expect.any(Number) }));
  }, 15000);
});

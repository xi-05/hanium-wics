import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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

function createUserContext(): TrpcContext {
  return {
    user: {
      id: 4,
      openId: "regular-user",
      email: "user@wics.io",
      name: "Regular User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createViewerContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "viewer-user",
      email: "viewer@wics.io",
      name: "Viewer",
      loginMethod: "manus",
      role: "viewer",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

function createOperatorContext(): TrpcContext {
  return {
    user: {
      id: 3,
      openId: "operator-user",
      email: "operator@wics.io",
      name: "Operator",
      loginMethod: "manus",
      role: "operator",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

describe("robots.liveData", () => {
  it("returns DB-backed telemetry without random synthetic fields", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const data = await caller.robots.liveData({ robotId: 1 });
    expect(data).toHaveProperty("robotId", 1);
    expect(data).toHaveProperty("timestamp");
    expect(data?.velocity.linear).toBeTypeOf("number");
    expect(data?.system.cpuUsage).toBe(0);
    expect(data?.sensors.camera.fps).toBe(0);
  });

  it("does not fabricate telemetry for a viewer when no robot exists", async () => {
    const caller = appRouter.createCaller(createViewerContext());
    const data = await caller.robots.liveData({ robotId: 2 });
    expect(data).toBeNull();
  });
});

describe("robots.startMission - permission control", () => {
  it("allows admin to reach the DB-backed start procedure without mutating a real robot", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.robots.startMission({ robotId: 999999 });
    expect(result.error).toBe("로봇을 찾을 수 없습니다.");
  });

  it("allows operator to reach the DB-backed start procedure without mutating a real robot", async () => {
    const caller = appRouter.createCaller(createOperatorContext());
    const result = await caller.robots.startMission({ robotId: 999999 });
    expect(result.error).toBe("로봇을 찾을 수 없습니다.");
  });

  it("denies viewer from starting mission", async () => {
    const caller = appRouter.createCaller(createViewerContext());
    const result = await caller.robots.startMission({ robotId: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe("제어 권한이 없습니다.");
  });
});

describe("robots.stopMission - permission control", () => {
  it("allows admin to reach the DB-backed stop procedure without mutating a real robot", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.robots.stopMission({ robotId: 999999 });
    expect(result.error).toBe("로봇을 찾을 수 없습니다.");
  });

  it("denies viewer from stopping mission", async () => {
    const caller = appRouter.createCaller(createViewerContext());
    const result = await caller.robots.stopMission({ robotId: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe("제어 권한이 없습니다.");
  });
});

describe("robots.emergencyStop - permission control", () => {
  it("allows admin to emergency stop", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.robots.emergencyStop({ robotId: 1 });
    expect(result.success).toBe(true);
  });

  it("allows operator to emergency stop", async () => {
    const caller = appRouter.createCaller(createOperatorContext());
    const result = await caller.robots.emergencyStop({ robotId: 1 });
    expect(result.success).toBe(true);
  });

  it("denies viewer from emergency stop", async () => {
    const caller = appRouter.createCaller(createViewerContext());
    const result = await caller.robots.emergencyStop({ robotId: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe("제어 권한이 없습니다.");
  });

  it("denies regular user from emergency stop", async () => {
    const caller = appRouter.createCaller(createUserContext());
    const result = await caller.robots.emergencyStop({ robotId: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toBe("제어 권한이 없습니다.");
  });
});

describe("users.list - admin only", () => {
  it("allows admin to list users", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // Will return empty array since no DB in test
    const result = await caller.users.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("denies viewer from listing users", async () => {
    const caller = appRouter.createCaller(createViewerContext());
    await expect(caller.users.list()).rejects.toThrow();
  });

  it("denies operator from listing users", async () => {
    const caller = appRouter.createCaller(createOperatorContext());
    await expect(caller.users.list()).rejects.toThrow();
  });
});

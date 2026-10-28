import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  return { db: { select, insert }, limit, insertValues };
});

vi.mock("./db", () => ({
  getDb: vi.fn(async () => mocks.db),
}));

import { appRouter } from "./routers";
import { hashPassword } from "./password";

function createPublicContext(): TrpcContext & { setCookie: ReturnType<typeof vi.fn> } {
  const setCookie = vi.fn();
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: setCookie } as unknown as TrpcContext["res"],
    setCookie,
  };
}

describe("email authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects passwords that do not follow the WICS policy", async () => {
    const caller = appRouter.createCaller(createPublicContext());

    await expect(caller.auth.signup({
      name: "Operator",
      email: "operator@example.com",
      password: "password",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("creates a read-only email account and sets a session cookie", async () => {
    const createdUser = {
      id: 42,
      openId: "email-test-user",
      name: "Operator",
      email: "operator@example.com",
      loginMethod: "email",
      role: "user" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    };
    mocks.limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([createdUser]);
    const context = createPublicContext();
    const caller = appRouter.createCaller(context);

    const result = await caller.auth.signup({
      name: "Operator",
      email: " Operator@Example.COM ",
      password: "Rescue123!",
    });

    expect(result).toMatchObject({ success: true, user: createdUser });
    expect(mocks.insertValues).toHaveBeenCalledTimes(2);
    expect(mocks.insertValues).toHaveBeenNthCalledWith(2, expect.objectContaining({
      userId: 42,
      normalizedEmail: "operator@example.com",
      passwordHash: expect.stringContaining(":"),
    }));
    expect(mocks.insertValues.mock.calls[1]?.[0].passwordHash).not.toContain("Rescue123!");
    expect(context.setCookie).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ maxAge: expect.any(Number) }));
  });

  it("verifies a stored password hash without exposing the password", async () => {
    const stored = await hashPassword("Rescue123!");
    expect(stored).not.toContain("Rescue123!");
  });
});

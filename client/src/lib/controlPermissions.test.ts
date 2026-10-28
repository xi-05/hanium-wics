import { describe, expect, it, vi } from "vitest";
import { CONTROL_PERMISSION_MESSAGE, hasRobotControlPermission, runControlAction } from "./controlPermissions";

describe("robot control permissions", () => {
  it.each(["admin", "operator"])("allows %s to control robots", role => {
    expect(hasRobotControlPermission(role)).toBe(true);
  });

  it.each(["viewer", "user", null, undefined])("denies robot control for %s", role => {
    expect(hasRobotControlPermission(role)).toBe(false);
  });

  it("uses the required denial message", () => {
    expect(CONTROL_PERMISSION_MESSAGE).toBe("제어 권한이 없습니다. 관리자(Admin)에게 문의하세요.");
  });

  it.each(["viewer", "user"])("does not execute control mutations for %s", role => {
    const mutation = vi.fn();
    const denied = vi.fn();

    const executed = runControlAction(role, mutation, denied);

    expect(executed).toBe(false);
    expect(mutation).not.toHaveBeenCalled();
    expect(denied).toHaveBeenCalledOnce();
  });

  it.each(["admin", "operator"])("executes control mutations for %s", role => {
    const mutation = vi.fn();
    const denied = vi.fn();

    const executed = runControlAction(role, mutation, denied);

    expect(executed).toBe(true);
    expect(mutation).toHaveBeenCalledOnce();
    expect(denied).not.toHaveBeenCalled();
  });
});

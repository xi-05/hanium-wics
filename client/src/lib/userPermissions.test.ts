import { describe, expect, it } from "vitest";
import { canManageUsers } from "./userPermissions";

describe("canManageUsers", () => {
  it("allows administrators to manage users", () => {
    expect(canManageUsers("admin")).toBe(true);
  });

  it.each(["viewer", "user", "operator", null, undefined])(
    "denies user management for %s",
    role => {
      expect(canManageUsers(role)).toBe(false);
    },
  );
});

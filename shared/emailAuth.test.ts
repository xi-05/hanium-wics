import { describe, expect, it } from "vitest";
import { isValidEmail, normalizeEmail, validatePassword } from "./emailAuth";

describe("email auth validation", () => {
  it("normalizes email addresses before storage", () => {
    expect(normalizeEmail("  Operator@Example.COM ")).toBe("operator@example.com");
    expect(isValidEmail("operator@example.com")).toBe(true);
  });

  it("requires the requested password character classes", () => {
    expect(validatePassword("Abc123!x")).toBeNull();
    expect(validatePassword("short1!")).not.toBeNull();
    expect(validatePassword("abcdefgh!")).not.toBeNull();
    expect(validatePassword("Abcdefgh1")).not.toBeNull();
    expect(validatePassword("Abc123?x")).not.toBeNull();
  });
});

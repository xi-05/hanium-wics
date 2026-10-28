import { describe, expect, it, vi } from "vitest";
import { redirectToLogin } from "./authRedirect";

describe("redirectToLogin", () => {
  it("replaces the current location with the login URL", () => {
    const replace = vi.fn();
    const target = { replace };
    const loginUrl = "https://auth.example.test/app-auth?type=signIn";

    redirectToLogin(loginUrl, target);

    expect(replace).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith(loginUrl);
  });
});

import { describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({
  toast: {
    error: toastError,
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

import { CONTROL_PERMISSION_MESSAGE } from "@/lib/controlPermissions";
import { ReadonlyControlGuard } from "./RobotControl";

describe("ReadonlyControlGuard", () => {
  it("shows the permission popup when a read-only user clicks a disabled control", () => {
    const element = ReadonlyControlGuard({ blocked: true, children: null });

    element.props.onClick();

    expect(toastError).toHaveBeenCalledWith(CONTROL_PERMISSION_MESSAGE);
  });

  it("does not show the permission popup for a user with control permission", () => {
    toastError.mockClear();
    const element = ReadonlyControlGuard({ blocked: false, children: null });

    element.props.onClick();

    expect(toastError).not.toHaveBeenCalled();
  });
});

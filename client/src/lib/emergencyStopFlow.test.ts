import { describe, expect, it, vi } from "vitest";
import {
  createEmergencyStopFlow,
  EMERGENCY_STOP_CONFIRM_ACTION,
  EMERGENCY_STOP_CONFIRM_TITLE,
} from "./emergencyStopFlow";

describe("emergency stop confirmation flow", () => {
  it("uses explicit confirmation copy", () => {
    expect(EMERGENCY_STOP_CONFIRM_TITLE).toBe("정말 긴급 정지하시겠습니까?");
    expect(EMERGENCY_STOP_CONFIRM_ACTION).toBe("긴급정지 정말 실행");
  });

  it("opens confirmation without executing the mutation", () => {
    const openConfirmation = vi.fn();
    const executeEmergencyStop = vi.fn();
    const flow = createEmergencyStopFlow({
      role: "admin",
      openConfirmation,
      executeEmergencyStop,
      showPermissionDenied: vi.fn(),
    });

    flow.request();

    expect(openConfirmation).toHaveBeenCalledOnce();
    expect(executeEmergencyStop).not.toHaveBeenCalled();
  });

  it("does not execute the mutation when the dialog is only opened and then cancelled", () => {
    const executeEmergencyStop = vi.fn();
    const closeConfirmation = vi.fn();
    const flow = createEmergencyStopFlow({
      role: "operator",
      openConfirmation: vi.fn(),
      closeConfirmation,
      executeEmergencyStop,
      showPermissionDenied: vi.fn(),
    });

    flow.request();
    flow.cancel();

    expect(closeConfirmation).toHaveBeenCalledOnce();
    expect(executeEmergencyStop).not.toHaveBeenCalled();
  });

  it("executes the mutation only after explicit confirmation", () => {
    const executeEmergencyStop = vi.fn();
    const closeConfirmation = vi.fn();
    const flow = createEmergencyStopFlow({
      role: "admin",
      openConfirmation: vi.fn(),
      closeConfirmation,
      executeEmergencyStop,
      showPermissionDenied: vi.fn(),
    });

    flow.request();
    flow.confirm();

    expect(executeEmergencyStop).toHaveBeenCalledOnce();
    expect(closeConfirmation).toHaveBeenCalledOnce();
  });

  it("blocks read-only users before opening the confirmation", () => {
    const openConfirmation = vi.fn();
    const executeEmergencyStop = vi.fn();
    const showPermissionDenied = vi.fn();
    const flow = createEmergencyStopFlow({
      role: "viewer",
      openConfirmation,
      executeEmergencyStop,
      showPermissionDenied,
    });

    flow.request();

    expect(openConfirmation).not.toHaveBeenCalled();
    expect(executeEmergencyStop).not.toHaveBeenCalled();
    expect(showPermissionDenied).toHaveBeenCalledOnce();
  });
});

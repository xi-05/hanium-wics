import { runControlAction } from "./controlPermissions";

export const EMERGENCY_STOP_CONFIRM_TITLE = "정말 긴급 정지하시겠습니까?";
export const EMERGENCY_STOP_CONFIRM_ACTION = "긴급정지 정말 실행";

interface EmergencyStopFlowOptions {
  role: string | null | undefined;
  openConfirmation: () => void;
  closeConfirmation?: () => void;
  executeEmergencyStop: () => void;
  showPermissionDenied: () => void;
}

export function createEmergencyStopFlow(options: EmergencyStopFlowOptions) {
  return {
    request() {
      return runControlAction(options.role, options.openConfirmation, options.showPermissionDenied);
    },
    confirm() {
      return runControlAction(options.role, () => {
        options.executeEmergencyStop();
        options.closeConfirmation?.();
      }, options.showPermissionDenied);
    },
    cancel() {
      options.closeConfirmation?.();
    },
  };
}

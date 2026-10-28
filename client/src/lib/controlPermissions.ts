export const CONTROL_PERMISSION_MESSAGE = "제어 권한이 없습니다. 관리자(Admin)에게 문의하세요.";

export function hasRobotControlPermission(role: string | null | undefined): boolean {
  return role === "admin" || role === "operator";
}

export function runControlAction(
  role: string | null | undefined,
  onAllowed: () => void,
  onDenied: () => void,
): boolean {
  if (!hasRobotControlPermission(role)) {
    onDenied();
    return false;
  }

  onAllowed();
  return true;
}

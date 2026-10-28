export function canManageUsers(role: string | null | undefined): boolean {
  return role === "admin";
}

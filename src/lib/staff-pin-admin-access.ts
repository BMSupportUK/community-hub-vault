export const STAFF_PIN_ROLES = ["admin", "management", "staff", "moderator"] as const;

export function canManageStaffPins(roles: readonly string[]): boolean {
  return roles.some((role) => role === "admin" || role === "management");
}

export function isStaffPinHolder(roles: readonly string[]): boolean {
  return roles.some((role) => STAFF_PIN_ROLES.some((allowed) => allowed === role));
}
// Revoking a staff PIN is restricted to the admin role only (not management).
export function canRevokeStaffPins(roles: readonly string[]): boolean {
  return roles.some((role) => role === "admin");
}

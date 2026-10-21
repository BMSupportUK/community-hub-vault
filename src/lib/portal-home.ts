import type { AppRole } from "@/hooks/use-auth";

const STAFF_ROLES: AppRole[] = ["admin", "management", "staff", "moderator"];

export function isStaffPortalUser(roles: readonly string[]) {
  return roles.some((r) => (STAFF_ROLES as string[]).includes(r));
}

/** Where a signed-in BM Support user lands: staff go to the Staff Portal, everyone else the Customer Portal. */
export function portalHomePath(roles: readonly string[]): "/staff-portal" | "/portal" {
  return isStaffPortalUser(roles) ? "/staff-portal" : "/portal";
}

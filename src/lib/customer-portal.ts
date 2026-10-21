import { z } from "zod";

export const portalCodeSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const portalTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const PORTAL_LINK_HOURS = 24;
export const PORTAL_EXPIRY_KEY = "bm-portal-expires-at";

/** A portal sign-in ends once its 24-hour link window has passed. */
export function portalSessionExpired(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return false;
  const t = new Date(expiresAt).getTime();
  return Number.isFinite(t) && t <= now;
}

/** Only admin and management may reset a portal link; staff may copy it. */
export function canResetPortal(roles: string[]) {
  return roles.includes("admin") || roles.includes("management");
}
export function canCopyPortal(roles: string[]) {
  return canResetPortal(roles) || roles.includes("staff");
}

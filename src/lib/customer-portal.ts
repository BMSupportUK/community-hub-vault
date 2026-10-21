import { z } from "zod";

export const portalCodeSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const portalTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const PORTAL_LINK_HOURS = 24;
export const PORTAL_LOCK_MINUTES = 60;
export const PORTAL_EXPIRY_KEY = "bm-portal-expires-at";

/** The portal locks one hour after opening, or sooner if the 24-hour link runs out first. */
export function portalLockAt(linkExpiresAt: string, now = Date.now()) {
  const lock = now + PORTAL_LOCK_MINUTES * 60_000;
  const link = new Date(linkExpiresAt).getTime();
  return new Date(Number.isFinite(link) ? Math.min(lock, link) : lock).toISOString();
}

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

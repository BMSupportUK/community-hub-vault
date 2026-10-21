import { z } from "zod";

export const portalCodeSchema = z.string().regex(/^[a-f0-9]{24}$/);
export const portalLoginCodeSchema = z.string().trim().regex(/^\d{8}$/, "Enter your 8-digit login code.");
export const PORTAL_LINK_HOURS = 24;
export const PORTAL_LOCK_MINUTES = 60;
export const PORTAL_EXPIRY_KEY = "bm-portal-expires-at";
export const PORTAL_USER_KEY = "bm-portal-user-id";

export function portalSecondsRemaining(expiresAt: string | null, now = Date.now()) {
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  return Number.isFinite(expiry) ? Math.max(0, Math.ceil((expiry - now) / 1000)) : 0;
}

export function portalCountdown(seconds: number) {
  return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function isPortalPath(path: string) {
  return path === "/shop" || path === "/tickets" || path.startsWith("/tickets/") || path === "/install-guides" || path === "/portal" || path.startsWith("/portal/");
}

export function portalAccessValid(expiresAt: string | null, ownerId: string | null, userId: string, now = Date.now()) {
  return ownerId === userId && !!expiresAt && !portalSessionExpired(expiresAt, now);
}

/** The portal locks one hour after opening, or sooner if the 24-hour link runs out first. */
export function portalLockAt(linkExpiresAt: string, now = Date.now()) {
  const lock = now + PORTAL_LOCK_MINUTES * 60_000;
  const link = new Date(linkExpiresAt).getTime();
  return new Date(Number.isFinite(link) ? Math.min(lock, link) : lock).toISOString();
}

/** A portal sign-in ends once its 24-hour link window has passed. */
export function portalSessionExpired(expiresAt: string | null, now = Date.now()) {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t <= now;
}

/** Only admin and management may reset a portal link; staff may copy it. */
export function canResetPortal(roles: string[]) {
  return roles.includes("admin") || roles.includes("management");
}
export function canCopyPortal(roles: string[]) {
  return canResetPortal(roles) || roles.includes("staff");
}

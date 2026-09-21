const TTL_MS = 15 * 60 * 1000;

export const ROLES_UNLOCK_KEY = (uid: string) => `roles_unlock_until:${uid}`;

export function isRolesUnlocked(userId: string | undefined | null): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(ROLES_UNLOCK_KEY(userId));
    const until = raw ? parseInt(raw, 10) : 0;
    if (until > Date.now()) return true;
    if (raw) sessionStorage.removeItem(ROLES_UNLOCK_KEY(userId));
  } catch {}
  return false;
}

export function markRolesUnlocked(userId: string) {
  try {
    sessionStorage.setItem(ROLES_UNLOCK_KEY(userId), String(Date.now() + TTL_MS));
  } catch {}
}

export const ROLES_UNLOCK_TTL_MS = TTL_MS;

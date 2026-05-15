const TTL_MS = 60 * 60 * 1000;
export const ADMIN_UNLOCK_KEY = (uid: string) => `admin_unlock_until:${uid}`;

export function isAdminUnlocked(userId: string | undefined | null): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(ADMIN_UNLOCK_KEY(userId));
    const until = raw ? parseInt(raw, 10) : 0;
    if (until > Date.now()) return true;
    if (raw) sessionStorage.removeItem(ADMIN_UNLOCK_KEY(userId));
  } catch {}
  return false;
}

export const ADMIN_UNLOCK_TTL_MS = TTL_MS;
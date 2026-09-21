const TTL_MS = 15 * 60 * 1000;

export const DISCOUNT_UNLOCK_KEY = (uid: string) => `discount_unlock_until:${uid}`;

export function isDiscountUnlocked(userId: string | undefined | null): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(DISCOUNT_UNLOCK_KEY(userId));
    const until = raw ? parseInt(raw, 10) : 0;
    if (until > Date.now()) return true;
    if (raw) sessionStorage.removeItem(DISCOUNT_UNLOCK_KEY(userId));
  } catch {}
  return false;
}

export function markDiscountUnlocked(userId: string) {
  try {
    sessionStorage.setItem(DISCOUNT_UNLOCK_KEY(userId), String(Date.now() + TTL_MS));
  } catch {}
}

export const DISCOUNT_UNLOCK_TTL_MS = TTL_MS;

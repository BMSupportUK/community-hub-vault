const TTL_MS = 15 * 60 * 1000;

export const SHOP_ORDERS_UNLOCK_KEY = (uid: string) => `shop_orders_unlock_until:${uid}`;

export function isShopOrdersUnlocked(userId: string | undefined | null): boolean {
  if (!userId || typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(SHOP_ORDERS_UNLOCK_KEY(userId));
    const until = raw ? parseInt(raw, 10) : 0;
    if (until > Date.now()) return true;
    if (raw) sessionStorage.removeItem(SHOP_ORDERS_UNLOCK_KEY(userId));
  } catch {}
  return false;
}

export function markShopOrdersUnlocked(userId: string) {
  try {
    sessionStorage.setItem(SHOP_ORDERS_UNLOCK_KEY(userId), String(Date.now() + TTL_MS));
  } catch {}
}

export function clearShopOrdersUnlock(userId: string | undefined | null) {
  if (!userId || typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SHOP_ORDERS_UNLOCK_KEY(userId));
  } catch {}
}

export const SHOP_ORDERS_UNLOCK_TTL_MS = TTL_MS;

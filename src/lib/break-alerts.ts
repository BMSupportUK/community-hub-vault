type AlertStorage = Pick<Storage, "getItem" | "setItem">;

/** Claim one popup/sound per break, regardless of warning or expiry stage. */
export function claimBreakAlert(id: string, seen: Set<string>, storage?: AlertStorage): boolean {
  const key = `bm-break-alert:${id}`;
  if (seen.has(id)) return false;
  try {
    if (storage?.getItem(key)) {
      seen.add(id);
      return false;
    }
    storage?.setItem(key, "shown");
  } catch { /* In-memory deduplication still works when storage is unavailable. */ }
  seen.add(id);
  return true;
}
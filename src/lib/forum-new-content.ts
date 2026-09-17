/** Tracks which "New content" forum posts the signed-in fan has already opened. */

export const NEW_CONTENT_READ_EVENT = "fz-new-content-read";

const key = (userId: string) => `fz-new-content-read:${userId}`;

export function getReadNewContentIds(userId: string | undefined | null): Set<string> {
  if (!userId || typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key(userId));
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? (list.filter((v) => typeof v === "string") as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Marks posts as read and tells every open counter to refresh straight away. */
export function markNewContentRead(userId: string | undefined | null, ids: string[]) {
  if (!userId || typeof window === "undefined" || ids.length === 0) return;
  const current = getReadNewContentIds(userId);
  let changed = false;
  for (const id of ids) {
    if (!current.has(id)) {
      current.add(id);
      changed = true;
    }
  }
  if (!changed) return;
  // Keep the store small — only recent ids matter for the unread badge.
  const trimmed = [...current].slice(-500);
  try {
    window.localStorage.setItem(key(userId), JSON.stringify(trimmed));
  } catch {
    /* storage full or unavailable — badge simply falls back to the timestamp marker */
  }
  window.dispatchEvent(new CustomEvent(NEW_CONTENT_READ_EVENT));
}

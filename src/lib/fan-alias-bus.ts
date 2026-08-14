/**
 * Instant, in-tab (and cross-tab) signal that a Fan Zone display name / avatar
 * changed. Realtime postgres_changes can be delayed or filtered by RLS, so we
 * also broadcast locally the moment a save succeeds.
 */
const EVENT = "fan-alias-updated";
const LS_KEY = "fanAliasUpdatedAt";

export function notifyFanAliasChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
  try {
    window.localStorage.setItem(LS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function onFanAliasChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const local = () => cb();
  const storage = (e: StorageEvent) => {
    if (e.key === LS_KEY) cb();
  };
  window.addEventListener(EVENT, local);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener("storage", storage);
  };
}

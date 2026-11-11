/** One login, limited connections: decides whether a new stream on this device clashes with other devices on the same login. */
import { isLive } from "./player-live";

export type OtherDevice = { id: string; name: string | null; platform: string | null; last_seen_at: string | null; watching_kind: string | null; watching_title: string | null };

/** Devices on the same login that are watching right now. */
export function activeStreams(others: OtherDevice[], selfId: string, now = Date.now()): OtherDevice[] {
  return others.filter((d) => d.id !== selfId && !!d.watching_kind && isLive(d.last_seen_at, now));
}

/** Busy when the other devices plus the screens this device wants would go over the login's connections (Multi Room / Triple Room share automatically). */
export function streamClash(others: OtherDevice[], selfId: string, max: number, now = Date.now(), screens = 1) {
  const active = activeStreams(others, selfId, now);
  const allowed = Math.max(1, Math.floor(max) || 1);
  const want = Math.max(1, Math.min(allowed, Math.floor(screens) || 1));
  return active.length + want > allowed ? active : [];
}

/** "Who's watching" list for the main menu: other rooms on this login, no ids or tokens. */
export function roomsWatching(others: OtherDevice[], selfId: string, now = Date.now()) {
  return activeStreams(others, selfId, now).slice(0, 5).map((d) => ({ name: d.name || "BM Player", platform: d.platform, title: d.watching_title }));
}

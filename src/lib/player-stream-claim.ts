/** One login, limited connections: decides whether a new stream on this device clashes with other devices on the same login. */
import { isLive } from "./player-live";

export type OtherDevice = { id: string; name: string | null; platform: string | null; last_seen_at: string | null; watching_kind: string | null; watching_title: string | null; watching_screens?: number | null };

/** Devices on the same login that are watching right now. */
export function activeStreams(others: OtherDevice[], selfId: string, now = Date.now()): OtherDevice[] {
  return others.filter((d) => d.id !== selfId && !!d.watching_kind && isLive(d.last_seen_at, now));
}

/** Busy when the other devices plus the screens this device wants would go over the login's connections (Multi Room / Triple Room share automatically). */
export function streamClash(others: OtherDevice[], selfId: string, max: number, now = Date.now(), screens = 1) {
  const active = activeStreams(others, selfId, now);
  const allowed = Math.max(1, Math.floor(max) || 1);
  const want = Math.max(1, Math.min(allowed, Math.floor(screens) || 1));
  return screensInUse(active) + want > allowed ? active : [];
}

/** Screens the other devices are using (a Multi-screen app counts every screen it plays). */
export function screensInUse(active: OtherDevice[]): number {
  return active.reduce((n, d) => n + Math.max(1, Math.min(3, Math.floor(d.watching_screens ?? 1) || 1)), 0);
}

/** "All 2 connections on this login are in use: BM Player – Fire TV is watching 2 screens." */
export function maxedMessage(active: OtherDevice[], max: number): string {
  const allowed = Math.max(1, Math.floor(max) || 1);
  const who = active.slice(0, 3).map((d) => {
    const n = Math.max(1, Math.floor(d.watching_screens ?? 1) || 1);
    return (d.name || "Another device") + (n > 1 ? ` is watching ${n} screens${d.watching_title ? ` (${d.watching_title})` : ""}` : d.watching_title ? ` is watching ${d.watching_title}` : " is watching");
  }).join(", ");
  return `All ${allowed} ${allowed === 1 ? "connection" : "connections"} on this login are in use: ${who}. The number of screens is already maxed.`;
}

/** "Who's watching" list for the main menu: other rooms on this login, no ids or tokens. */
export function roomsWatching(others: OtherDevice[], selfId: string, now = Date.now()) {
  return activeStreams(others, selfId, now).slice(0, 5).map((d) => ({ name: d.name || "BM Player", platform: d.platform, title: d.watching_title, screens: Math.max(1, Math.floor(d.watching_screens ?? 1) || 1) }));
}

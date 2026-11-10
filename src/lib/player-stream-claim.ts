/** One login, limited connections: decides whether a new stream on this device clashes with other devices on the same login. */
import { isLive } from "./player-live";

export type OtherDevice = { id: string; name: string | null; platform: string | null; last_seen_at: string | null; watching_kind: string | null; watching_title: string | null };

/** Devices on the same login that are watching right now. */
export function activeStreams(others: OtherDevice[], selfId: string, now = Date.now()): OtherDevice[] {
  return others.filter((d) => d.id !== selfId && !!d.watching_kind && isLive(d.last_seen_at, now));
}

/** Busy when the other devices already use every connection the login allows. */
export function streamClash(others: OtherDevice[], selfId: string, max: number, now = Date.now()) {
  const active = activeStreams(others, selfId, now);
  const allowed = Math.max(1, Math.floor(max) || 1);
  return active.length >= allowed ? active : [];
}

import { Cigarette, Moon, Toilet, Users } from "lucide-react";

export const AWAY_REASONS = ["Toilet Break", "Smoking Break", "Meeting", "Outside Of Office Hours"] as const;
export type AwayReason = (typeof AWAY_REASONS)[number];

/** Each Away reason gets its own icon, the same way break kinds do. */
export function awayIcon(reason: string | null | undefined) {
  if (reason === "Toilet Break") return Toilet;
  if (reason === "Smoking Break") return Cigarette;
  if (reason === "Meeting") return Users;
  return Moon; // Outside Of Office Hours and anything unknown keeps the moon.
}
export function isScheduledAway(reason: AwayReason) {
  return reason === "Outside Of Office Hours";
}

/**
 * Live "how long have you been Away" label for the manually-started reasons
 * (Toilet Break, Smoking Break, Meeting), which have no automatic finish.
 * Render it with a clock that ticks every second and it updates live.
 */
export function awayElapsedLabel(startMs: number, nowMs: number): string {
  const sec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const pad = (n: number) => n.toString().padStart(2, "0");
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0) return `${m}m ${pad(s)}s`;
  return `${s}s`;
}
export function awayWindow(reason: AwayReason, start: number, end: number, now = Date.now()) {
  if (!isScheduledAway(reason)) return { starts_at: new Date(now).toISOString(), ends_at: null };
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now) throw new Error("Choose a finish after the start and in the future");
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() };
}

/** One logged Away period from the away_log table. */
export type AwayLogRow = { id: string; reason: string; starts_at: string; ends_at: string | null };

/**
 * Away periods that fall inside a shift's clocked window, so every shift report
 * can list them next to the breaks. An open period counts until the shift ends.
 */
export function awayForShift(
  rows: AwayLogRow[],
  shift: { clock_in: string; clock_out: string | null },
) {
  const from = new Date(shift.clock_in).getTime();
  const to = shift.clock_out ? new Date(shift.clock_out).getTime() : Date.now();
  return rows.filter(
    (a) => new Date(a.starts_at).getTime() < to && (!a.ends_at || new Date(a.ends_at).getTime() > from),
  );
}
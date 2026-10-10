export const AWAY_REASONS = ["Toilet Break", "Smoking Break", "Meeting", "Outside Of Office Hours"] as const;
export type AwayReason = (typeof AWAY_REASONS)[number];
export function isScheduledAway(reason: AwayReason) {
  return reason === "Outside Of Office Hours";
}
export function awayWindow(reason: AwayReason, start: number, end: number, now = Date.now()) {
  if (!isScheduledAway(reason)) return { starts_at: new Date(now).toISOString(), ends_at: null };
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now) throw new Error("Choose a finish after the start and in the future");
  return { starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() };
}
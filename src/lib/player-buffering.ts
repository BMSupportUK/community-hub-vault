import { z } from "zod";

/** One buffering stall as reported by a BM Player app. */
export const BufferEvent = z.object({
  kind: z.enum(["live", "film", "series", "catchup"]).catch("live"),
  content_id: z.string().trim().max(200).catch(""),
  name: z.string().trim().max(200).catch(""),
  stall_ms: z.number().int().min(0).max(3_600_000),
  reconnected: z.boolean().catch(false),
  at: z.number().int().positive(),
});
export const BufferBatch = z.array(BufferEvent).min(1).max(20);
export type BufferEventInput = z.infer<typeof BufferEvent>;

/** Distinct devices stalling on one channel/title inside the window that means "provider problem". */
export const ALERT_DEVICES = 5;
export const ALERT_WINDOW_MS = 10 * 60_000;
export const ALERT_COOLDOWN_MS = 60 * 60_000;
/** Ignore event times far from the server clock (wrong device clock or replayed batch). */
export const MAX_CLOCK_SKEW_MS = 24 * 60 * 60_000;

/** Clamp an app-supplied time to the server clock so old or future events don't skew the summary. */
export function eventTime(at: number, now: number): number {
  return Math.abs(now - at) > MAX_CLOCK_SKEW_MS ? now : Math.min(at, now);
}

export function shouldAlert(distinctDevices: number): boolean {
  return distinctDevices >= ALERT_DEVICES;
}

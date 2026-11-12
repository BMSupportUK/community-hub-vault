import { z } from "zod";

/** One buffering stall as reported by a BM Player app. */
export const BufferEvent = z.object({
  kind: z.enum(["live", "film", "series", "catchup"]).catch("live"),
  content_id: z.string().trim().max(200).catch(""),
  name: z.string().trim().max(200).catch(""),
  stall_ms: z.number().int().min(0).max(3_600_000),
  reconnected: z.boolean().catch(false),
  freeze: z.boolean().optional().catch(false),
  cause: z.enum(["provider_cut", "advert_switch", "network_drop"]).optional().catch(undefined),
  stream_format: z.enum(['ts', 'm3u8', 'direct']).optional().catch(undefined),
  decoder: z.string().trim().max(120).optional().catch(undefined),
  recovery_provider: z.enum(['dazn']).optional().catch(undefined),
  event_name: z.string().trim().max(200).optional().catch(undefined),
  swapped_to: z.string().trim().max(200).optional().catch(undefined),
  swap_reason: z.enum(['manual', 'auto']).optional().catch(undefined),
  at: z.number().int().positive(),
});
export const BufferBatch = z.array(BufferEvent).min(1).max(20);
/** Older apps send no cause: a zero-length freeze is a provider cut, anything else a network drop. */
export function stallCause(e: { cause?: string; freeze?: boolean; stall_ms: number }): "provider_cut" | "advert_switch" | "network_drop" {
  if (e.cause === "provider_cut" || e.cause === "advert_switch" || e.cause === "network_drop") return e.cause;
  return e.freeze && e.stall_ms === 0 ? "provider_cut" : "network_drop";
}
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

/** One feed switch (picture/sound/timing/frame-rate change or provider restart) seen on a live channel. */
export const SWITCH_TYPES = ["picture", "sound", "timing", "frame_rate", "provider_restart"] as const;
export const FeedSwitch = z.object({
  type: z.enum(SWITCH_TYPES),
  content_id: z.string().trim().max(200).catch(""),
  name: z.string().trim().max(200).catch(""),
  category: z.string().trim().max(200).optional().catch(undefined),
  stalled: z.boolean().optional().catch(false),
  at: z.number().int().positive(),
});
export const FeedSwitchBatch = z.array(FeedSwitch).min(1).max(50);
/** A device counts one channel's switch of one type at most once per window. */
export const SWITCH_DEDUPE_MS = 30_000;
export function dedupeSwitches<T extends { type: string; content_id: string; name: string; at: number }>(list: T[]): T[] {
  const last = new Map<string, number>(); const out: T[] = [];
  for (const s of [...list].sort((a, b) => a.at - b.at)) {
    const key = s.type + "|" + (s.content_id || s.name); const prev = last.get(key);
    if (prev !== undefined && s.at - prev < SWITCH_DEDUPE_MS) continue;
    last.set(key, s.at); out.push(s);
  }
  return out;
}

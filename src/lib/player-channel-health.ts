/**
 * Which Sports Guide channels get a "not working" cross.
 * A problem (player failure, black screen, website check failure) marks a channel for PROBLEM_WINDOW_MS
 * unless a clean play or passing check arrives after it. Repeated stalls count as a problem too.
 */
export const PROBLEM_WINDOW_MS = 15 * 60_000;
export const STALL_WINDOW_MS = 5 * 60_000;
export const STALL_LIMIT = 3;
/** Players report "ok" only after this much clean playback. */
export const CLEAN_PLAY_MS = 2 * 60_000;

export const channelKey = (name: string) => name.trim().toLowerCase();

export type HealthRow = { channel_key: string; channel_name: string; last_problem_at: string | null; last_ok_at: string | null };

/** True when the newest problem is recent and nothing played cleanly since. */
export function isCrossed(row: Pick<HealthRow, "last_problem_at" | "last_ok_at">, nowMs: number, stallTimes: number[] = []): boolean {
  const ok = row.last_ok_at ? Date.parse(row.last_ok_at) : 0;
  const problem = row.last_problem_at ? Date.parse(row.last_problem_at) : 0;
  if (problem && nowMs - problem <= PROBLEM_WINDOW_MS && problem > ok) return true;
  const stalls = stallTimes.filter((t) => nowMs - t <= STALL_WINDOW_MS && t > ok);
  return stalls.length >= STALL_LIMIT;
}

/** Crossed channel display names from health rows plus recent live stall times per channel name. */
export function crossedChannels(rows: HealthRow[], stalls: { name: string; at: number }[], nowMs: number): string[] {
  const byKey = new Map(rows.map((r) => [r.channel_key, r]));
  const stallMap = new Map<string, { name: string; times: number[] }>();
  for (const s of stalls) {
    const k = channelKey(s.name); if (!k) continue;
    const e = stallMap.get(k) ?? { name: s.name, times: [] };
    e.times.push(s.at); stallMap.set(k, e);
  }
  const out: string[] = [];
  for (const k of new Set([...byKey.keys(), ...stallMap.keys()])) {
    const row = byKey.get(k) ?? { channel_key: k, channel_name: stallMap.get(k)!.name, last_problem_at: null, last_ok_at: null };
    if (isCrossed(row, nowMs, stallMap.get(k)?.times ?? [])) out.push(row.channel_name);
  }
  return out.sort();
}

/**
 * Reads an MPEG-TS sample and counts packets on the video stream named in the PMT.
 * Returns null when the bytes aren't a transport stream at all.
 */
export function tsVideoPackets(buf: Uint8Array): number | null {
  let start = -1;
  for (let i = 0; i + 376 < buf.length && i < 188 * 4; i++) if (buf[i] === 0x47 && buf[i + 188] === 0x47 && buf[i + 376] === 0x47) { start = i; break; }
  if (start < 0) return null;
  const pmtPids = new Set<number>(); const videoPids = new Set<number>();
  const VIDEO = new Set([0x01, 0x02, 0x10, 0x1b, 0x24, 0x42, 0xea]);
  let video = 0;
  for (let p = start; p + 188 <= buf.length; p += 188) {
    if (buf[p] !== 0x47) continue;
    const pusi = (buf[p + 1] & 0x40) !== 0;
    const pid = ((buf[p + 1] & 0x1f) << 8) | buf[p + 2];
    const afc = (buf[p + 3] >> 4) & 3;
    let o = p + 4;
    if (afc === 2) { if (videoPids.has(pid)) video++; continue; }
    if (afc === 3) o += 1 + buf[o];
    if (videoPids.has(pid)) { video++; continue; }
    if (!pusi || o >= p + 188) continue;
    o += 1 + buf[o]; // pointer field
    const end = p + 188;
    if (pid === 0 && buf[o] === 0x00) {
      const len = ((buf[o + 1] & 0x0f) << 8) | buf[o + 2];
      for (let q = o + 8; q + 4 <= Math.min(end, o + 3 + len - 4); q += 4) {
        const prog = (buf[q] << 8) | buf[q + 1];
        if (prog !== 0) pmtPids.add(((buf[q + 2] & 0x1f) << 8) | buf[q + 3]);
      }
    } else if (pmtPids.has(pid) && buf[o] === 0x02) {
      const len = ((buf[o + 1] & 0x0f) << 8) | buf[o + 2];
      const infoLen = ((buf[o + 10] & 0x0f) << 8) | buf[o + 11];
      const stop = Math.min(end, o + 3 + len - 4);
      for (let q = o + 12 + infoLen; q + 5 <= stop;) {
        const type = buf[q]; const es = ((buf[q + 1] & 0x1f) << 8) | buf[q + 2];
        if (VIDEO.has(type)) videoPids.add(es);
        q += 5 + (((buf[q + 3] & 0x0f) << 8) | buf[q + 4]);
      }
    }
  }
  return video;
}

/** A website check passes when at least this many video packets (~50 KB of picture) arrive in the sample. */
export const MIN_VIDEO_PACKETS = 300;

/** Admin channel list: offline when crossed, online when it played/passed within ONLINE_WINDOW_MS, else unchecked. */
export const ONLINE_WINDOW_MS = 24 * 3600_000;
export type ChannelStatus = "online" | "offline" | "unchecked";
export function channelStatus(row: Pick<HealthRow, "last_problem_at" | "last_ok_at"> | undefined, nowMs: number): ChannelStatus {
  if (!row) return "unchecked";
  if (isCrossed(row, nowMs)) return "offline";
  const ok = row.last_ok_at ? Date.parse(row.last_ok_at) : 0;
  return ok && nowMs - ok <= ONLINE_WINDOW_MS ? "online" : "unchecked";
}

/** Crosses only show from this long before an event starts until it ends. */
export const CROSS_LEAD_MS = 10 * 60_000;

/**
 * Event-only feeds are blank between events, so reports outside an event mean nothing:
 * "UFC 04 |", "MonoMax 27 | (Events Only)", "HBO Max UK | Event 1", "Boxing 03 | …", "Channel 15".
 */
export function isEventChannel(name: string): boolean {
  const n = name.normalize("NFKD").trim();
  // DAZN Canada feeds ("ᴰᴬᶻᴺ ¹ 01 (CA | Main)") only carry events.
  if (/d\s*a\s*z\s*n/i.test(n) && /\bca\b/i.test(n)) return true;
  if (/\|\s*$/.test(n) || /events?\s*only/i.test(n) || /\bevent\s*\d+\b/i.test(n) || /^channel\s+\d+$/i.test(n)) return true;
  return /^[^|]*?\b\d{1,3}\s*(\([^)]*\))?\s*\|/.test(n) && !/^(uk|us|ca|au|ie)\s*\|/i.test(n);
}

export type GuideEvent = { start: number; end?: number; channels: string[] };

/** True from 10 minutes before the start until the event's end (or 4h after start if unknown). */
export function eventWindowOpen(e: GuideEvent, nowMs: number): boolean {
  const end = e.end && e.end > e.start ? e.end : e.start + 4 * 3_600_000;
  return nowMs >= e.start - CROSS_LEAD_MS && nowMs <= end;
}

/** Channels to cross on one event card: only inside its window, counting only problems from that window. */
export function eventUnavailable(e: GuideEvent, rows: HealthRow[], stalls: { name: string; at: number }[], nowMs: number): string[] {
  if (!eventWindowOpen(e, nowMs)) return [];
  const since = e.start - CROSS_LEAD_MS;
  const byKey = new Map(rows.map((r) => [r.channel_key, r]));
  return e.channels.filter((c) => {
    const k = channelKey(c); const r = byKey.get(k);
    const event = isEventChannel(c);
    const problem = r?.last_problem_at && (!event || Date.parse(r.last_problem_at) >= since) ? r.last_problem_at : null;
    const times = stalls.filter((s) => channelKey(s.name) === k && (!event || s.at >= since)).map((s) => s.at);
    return isCrossed({ last_problem_at: problem, last_ok_at: r?.last_ok_at ?? null }, nowMs, times);
  });
}

/** Whether a problem report on this channel should count right now. 24/7 channels always count. */
export function acceptProblemReport(name: string, events: GuideEvent[], nowMs: number): boolean {
  if (!isEventChannel(name)) return true;
  const k = channelKey(name);
  return events.some((e) => eventWindowOpen(e, nowMs) && e.channels.some((c) => channelKey(c) === k));
}

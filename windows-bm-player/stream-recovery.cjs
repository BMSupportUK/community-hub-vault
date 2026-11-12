'use strict';
/** Anti-buffering rules shared by Windows and Mac (same numbers as Android's StreamRecovery). */
const DEFAULT_BUFFER_MS = 8000;
const MAX_TRIES = 8;
const STALL_RECONNECT_MS = 12000;
const MIN_REPORT_MS = 1000;
const STALL_WINDOW_MS = 120000;
const STALLS_TO_LOWER = 2;
const STALLS_TO_OFFER_SD = 3;
const BATCH = 20;
const FREEZE_MS = 4000;
/** Full quality returns after this long with no stalls (same as Android). */
const STABLE_RAISE_MS = 120000;
/** Live channels keep at least this much cushion so short provider cut-outs play through. */
const LIVE_BUFFER_MS = 5000;
/** Ordinary live pictures get this long to recover before a restart, independent of the shorter start wait. */
const LIVE_FREEZE_WAIT_MS = 12000;
function isDazn(name) { return /\bdazn\b/i.test(String(name || '').normalize('NFKC')); }
function isCoupang(name) { return /\bcoupang\b/i.test(String(name || '').normalize('NFKC')); }
/** Heavy before playing: UHD/4K/2160, FHD, 1080p50/60, 50/60fps (same rule as Android). */
function isHeavyName(name) { return /(\buhd\b|\b4k\b|2160|\bfhd\b|1080p?\s*(50|60)|\b(50|60)\s*fps\b)/i.test(String(name || '').normalize('NFKC')); }
/** Measured heavy: 8 Mbps+, taller than 1080, or 1080 at 49fps+. */
function heavyFormat(w, h, fps, bitrate) { const hh = w > 0 && h > 0 ? h : 0; return (bitrate || 0) >= 8000000 || hh > 1088 || (hh >= 1080 && (fps || 0) >= 49); }
const HEAVY = new Set(); const HEAVY_MAX = 500;
function heavyKey(name) { return String(name || '').normalize('NFKC').trim().toLowerCase(); }
function isHeavy(name) { return isHeavyName(name) || (!!heavyKey(name) && HEAVY.has(heavyKey(name))); }
/** Remember a measured heavy channel; true when newly added. */
function rememberHeavy(name) { const k = heavyKey(name); if (!k || isHeavyName(name) || HEAVY.has(k)) return false; HEAVY.add(k); while (HEAVY.size > HEAVY_MAX) HEAVY.delete(HEAVY.values().next().value); return true; }
function loadHeavy(list) { HEAVY.clear(); for (const k of Array.isArray(list) ? list.slice(-HEAVY_MAX) : []) if (typeof k === 'string' && k) HEAVY.add(k); }
function heavyList() { return [...HEAVY]; }
/** Sports-pass feeds (DAZN, Coupang Play) and high-bitrate streams get the steadier large-buffer profile. */
function cushioned(name) { return isDazn(name) || isCoupang(name) || isHeavy(name); }
/** Diagnostic tag for the admin buffering report. */
function providerTag(name) { return isDazn(name) ? 'dazn' : isCoupang(name) ? 'coupang' : isHeavy(name) ? 'high_bitrate' : null; }
function profile(name) { return cushioned(name) ? { min:40000, max:90000, start:3000, rebuffer:6000, live:30000, reconnect:20000, swap:1 } : { live:LIVE_BUFFER_MS, reconnect:STALL_RECONNECT_MS, swap:2 }; }
function liveBufferMs(setting, name) { return Math.max(profile(name).live, bufferMs(setting)); }

/** Play position not moving for 4s while "playing" means the picture froze. */
function frozen(session, state, position, now, status = {}) {
  if (status.nativeVideo && session.item?.kind === 'live') {
    const frames = status.videoFrames;
    if (state !== 3 || !Number.isFinite(frames) || frames <= 0) { session.pictureStillSince = 0; session.lastVideoFrames = undefined; return false; }
    if (frames !== session.lastVideoFrames) { session.lastVideoFrames = frames; session.pictureStillSince = now; return false; }
    if (!session.pictureStillSince) session.pictureStillSince = now;
    if (inAdvertGrace(session, now)) return false;
    // Let the configured live cushion recover before destroying the connection.
    const wait = Math.max(LIVE_FREEZE_WAIT_MS, profile(session.recoveryName || session.item?.name).live);
    if (now - session.pictureStillSince >= wait) { session.pictureStillSince = now; return true; }
    return false;
  }
  if (state !== 3) { session.stillSince = 0; session.lastPos = position; return false; }
  if (session.lastPos === undefined || Math.abs(position - session.lastPos) > 0.05) { session.lastPos = position; session.stillSince = now; return false; }
  if (!session.stillSince) session.stillSince = now;
  if (now - session.stillSince >= FREEZE_MS) { session.stillSince = now; return true; }
  return false;
}
/** Remembered working format (ts/m3u8) goes first. */
// Sky channels start on HLS: it copes with the provider's advert switches far better than MPEG-TS.
function startFormat(pref, name) { return pref || (/\bsky\b/i.test(String(name || '')) ? 'm3u8' : null); }

function preferFormat(urls, pref) {
  if (!pref || !Array.isArray(urls) || urls.length < 2) return urls;
  const ext = '.' + pref;
  return [...urls.filter(u => u.toLowerCase().endsWith(ext)), ...urls.filter(u => !u.toLowerCase().endsWith(ext))];
}
function otherFormat(url) { const l = String(url || '').toLowerCase(); return l.endsWith('.m3u8') ? 'ts' : l.endsWith('.ts') ? 'm3u8' : null; }

function bufferMs(setting) {
  const n = Number(setting);
  return Number.isFinite(n) && n >= 500 ? Math.min(15000, n) : DEFAULT_BUFFER_MS;
}
function backoffMs(attempt) { return attempt <= 1 ? 1000 : Math.min(10000, 1000 * 2 ** Math.min(attempt - 1, 4)); }
function giveUp(attempt) { return attempt > MAX_TRIES; }
function recentStalls(times, now) { return times.filter(t => now - t <= STALL_WINDOW_MS).length; }
function isHdName(name) { return /\b(hd|fhd|uhd|4k|1080p?|720p?)\b/i.test(String(name || '')); }

/**
 * One tick of the stall tracker for a playing session. `state` uses libVLC numbers
 * (1 opening, 2 buffering, 3 playing, 4 paused, 5 stopped, 6 ended, 7 error).
 * Returns what to do: {event, reconnect, lower, offerSd, failed}.
 */
// Advert switch: the provider changes the picture size at a Sky advert break and the stream stalls straight after.
const ADVERT_WINDOW_MS = 4000, ADVERT_JUMP_MS = 800;
/** After a programme/advert switch the buffer is kept this long before a stall or still picture counts as a fault. */
const ADVERT_GRACE_MS = 10000;
function inAdvertGrace(session, now) { return !!session.sizeAt && now - session.sizeAt >= 0 && now - session.sizeAt <= ADVERT_GRACE_MS; }
/** Feed change without a picture-size change: the stream clock jumps (back, or well ahead of real time) or the frame rate changes.
 *  Starts the same advert grace as a size change. VLC's live clock can sit at 0, so a zero reading is ignored. */
function feedChange(session, s, now) {
  const pos = Number(s && s.position) || 0, fps = Math.round(Number(s && s.fps) || 0);
  let changed = false;
  if (pos > 0 && session.clockPos > 0 && session.clockAt != null) {
    const moved = pos - session.clockPos, real = (now - session.clockAt) / 1000;
    if (moved < -1 || moved > real + 5) changed = true;
  }
  if (fps > 0 && session.fpsSeen > 0 && fps !== session.fpsSeen) changed = true;
  if (pos > 0) { session.clockPos = pos; session.clockAt = now; }
  if (fps > 0) session.fpsSeen = fps;
  if (changed && session.ready) session.sizeAt = now;
  return changed && !!session.ready;
}
// Never reopens the stream: a switch is waited out with the buffer kept (matches Android). Always returns false.
function advertJump(session, w, h, state, now, live) {
  if (w > 0 && h > 0) { const key = w + 'x' + h; if (session.size && session.size !== key) session.sizeAt = now; session.size = key; }
  if (state === 3 || state === 4) return false;
  if (!live || !session.ready || !session.stallAt || !session.sizeAt) return false;
  if (session.stallAt - session.sizeAt > ADVERT_WINDOW_MS || session.stallAt < session.sizeAt - 1000) return false;
  session.advertStall = true;
  return false;
}

function tick(session, state, now, live) {
  const out = {};
  if (state === 3) {
    if (session.stallAt) {
      const ms = now - session.stallAt;
      if (ms >= MIN_REPORT_MS) {
        out.event = { ms, reconnected: (session.reconnects || 0) > 0, cause: session.advertStall ? 'advert_switch' : 'network_drop' };
        session.stallTimes = [...(session.stallTimes || []), now].filter(t => now - t <= STALL_WINDOW_MS);
        const n = session.stallTimes.length;
        if (n >= STALLS_TO_LOWER && !session.lowered) { session.lowered = true; out.lower = true; }
        if (n >= 3 && live && !session.feedOffered) { session.feedOffered = true; out.offerFeed = true; }
        if (n >= STALLS_TO_OFFER_SD && live && !session.sdOffered && isHdName(session.item?.name)) { session.sdOffered = true; out.offerSd = true; }
      }
    }
    if (session.lowered && !out.lower) {
      const last = Math.max(session.lastStallAt || 0, ...(session.stallTimes || []));
      if (!session.lastStallAt) session.lastStallAt = now;
      if (now - last >= STABLE_RAISE_MS) { session.lowered = false; session.stallTimes = []; out.raise = true; }
    }
    if (out.event) session.lastStallAt = now;
    session.ready = true; session.advertStall = false; session.stallAt = 0; session.reconnects = 0; session.retryAt = 0;
    return out;
  }
  if (!session.ready || state === 4) return out;
  const broken = state === 7 || state === 5 || (live && state === 6);
  if ((state === 1 || state === 2 || broken) && !session.stallAt) session.stallAt = now;
  if (session.retryAt && now < session.retryAt) return out;
  const recovery = profile(session.recoveryName || session.item?.name);
  if (broken || (session.stallAt && now - session.stallAt >= recovery.reconnect + (session.advertStall ? ADVERT_GRACE_MS : 0) && (!session.retryAt || now >= session.retryAt))) {
    session.reconnects = (session.reconnects || 0) + 1;
    if (giveUp(session.reconnects)) {
      if (!session.failed) { session.failed = true; out.failed = true; out.event = { ms: now - session.stallAt, reconnected: true }; }
      return out;
    }
    const delay = cushioned(session.recoveryName || session.item?.name) && state === 6 ? 0 : backoffMs(session.reconnects);
    session.retryAt = now + delay + recovery.reconnect;
    out.reconnect = delay;
  }
  return out;
}

module.exports = { isDazn, isCoupang, isHeavyName, heavyFormat, isHeavy, rememberHeavy, loadHeavy, heavyList, HEAVY_MAX, cushioned, providerTag, profile, advertJump, feedChange, ADVERT_WINDOW_MS, ADVERT_GRACE_MS, inAdvertGrace, startFormat, FREEZE_MS, STABLE_RAISE_MS, LIVE_BUFFER_MS, liveBufferMs, frozen, preferFormat, otherFormat, DEFAULT_BUFFER_MS, MAX_TRIES, STALL_RECONNECT_MS, BATCH, bufferMs, backoffMs, giveUp, recentStalls, isHdName, tick };

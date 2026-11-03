/**
 * Mac playback engine. The main process keeps provider URLs private: the
 * renderer only ever sees short-lived bmstream://<token>/... addresses, and this
 * module proxies them to the provider (rewriting HLS playlists so every segment
 * also goes through the proxy). Playback itself happens in the renderer's
 * <video> element (hls.js / mpegts.js / native), which reports status back.
 */
const crypto = require('node:crypto');

const SCHEME = 'bmstream';
const TOKEN_TTL_MS = 12 * 60 * 60_000;
const origins = new Map(); // token -> { origin, expires }
const byOrigin = new Map(); // origin -> token
let userAgent = () => '';

function tokenFor(origin) {
  const now = Date.now();
  const existing = byOrigin.get(origin);
  if (existing && origins.get(existing)?.expires > now) return existing;
  const token = crypto.randomBytes(12).toString('hex');
  origins.set(token, { origin, expires: now + TOKEN_TTL_MS });
  byOrigin.set(origin, token);
  return token;
}

/** Convert a provider URL into a private proxy address. */
function toProxy(url) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Unsupported stream address.');
  return `${SCHEME}://${tokenFor(u.origin)}${u.pathname}${u.search}`;
}

/** Resolve a proxy address back to the provider URL, or null when unknown/expired. */
function fromProxy(url) {
  const u = new URL(url);
  const entry = origins.get(u.hostname);
  if (!entry || entry.expires < Date.now()) return null;
  return entry.origin + u.pathname + u.search;
}

/** Rewrite every URI in an HLS playlist so it resolves through the proxy. */
function rewritePlaylist(text, baseUrl) {
  const abs = value => toProxy(new URL(value, baseUrl).href);
  return String(text).split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_m, v) => `URI="${abs(v)}"`);
    return abs(trimmed);
  }).join('\n');
}

function streamKind(url) {
  const path = new URL(url).pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return 'hls';
  if (path.endsWith('.ts') || /\/live\/[^/]+\/[^/]+\/\d+$/.test(path)) return 'ts';
  return 'file';
}

function registerScheme(protocol) {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);
}

function handleProtocol(protocol) {
  protocol.handle(SCHEME, async request => {
    const target = fromProxy(request.url);
    if (!target) return new Response('Stream expired', { status: 404 });
    const headers = { 'User-Agent': userAgent() || 'VLC/3.0.21 LibVLC/3.0.21' };
    const range = request.headers.get('range');
    if (range && /^bytes=\d*-\d*$/.test(range)) headers.Range = range;
    let upstream;
    try { upstream = await fetch(target, { headers, redirect: 'follow' }); }
    catch { return new Response('Stream unavailable', { status: 502 }); }
    const out = new Headers({ 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const v = upstream.headers.get(k); if (v) out.set(k, v); }
    const type = (upstream.headers.get('content-type') || '').toLowerCase();
    const finalUrl = upstream.url || target;
    if (type.includes('mpegurl') || new URL(finalUrl).pathname.toLowerCase().endsWith('.m3u8')) {
      const body = rewritePlaylist(await upstream.text(), finalUrl);
      out.delete('content-length');
      out.set('content-type', 'application/vnd.apple.mpegurl');
      return new Response(body, { status: upstream.status, headers: out });
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  });
}

/** Same interface as the Windows EmbeddedVlc engine. VLC-style state codes: 3 playing, 4 paused, 6 ended, 7 error. */
class MacEngine {
  constructor(win, ua) {
    this.win = win;
    this.sessions = new Map();
    if (typeof ua === 'function') userAgent = ua;
  }
  send(data) { if (this.win && !this.win.isDestroyed()) this.win.webContents.send('player:event', { type: 'video', ...data }); }
  play(index, url, { buffer = 3000, resume = 0, live = true, subtitles = null } = {}) {
    const src = toProxy(url);
    this.sessions.set(index, { position: 0, duration: 0, state: 1, seekable: false });
    this.send({ action: 'play', index, src, kind: streamKind(url), buffer: Number(buffer) || 3000, resume: Number(resume) || 0, live: live !== false, subtitles });
  }
  report(value) {
    const index = Number(value?.index);
    const s = this.sessions.get(index);
    if (!s) return;
    const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
    s.position = num(value.position);
    s.duration = num(value.duration);
    s.state = [1, 3, 4, 5, 6, 7].includes(Number(value.state)) ? Number(value.state) : s.state;
    s.seekable = !!value.seekable;
    s.subs = Math.max(0, Math.min(50, Number(value.subs) || 0));
  }
  status(index) { const s = this.sessions.get(index); return s ? { ...s } : null; }
  subtitleTracks(index) { return this.sessions.get(index)?.subs || 0; }
  setSubtitles(index, on) { if (this.sessions.has(index)) this.send({ action: 'subtitles', index, on: !!on }); }
  layout() {}
  pause(index, paused) { if (this.sessions.has(index)) this.send({ action: 'pause', index, paused: !!paused }); }
  seek(index, seconds) { if (this.sessions.has(index)) this.send({ action: 'seek', index, seconds }); }
  volume(index, value) { if (this.sessions.has(index)) this.send({ action: 'volume', index, volume: value }); }
  stop(index) { if (this.sessions.delete(index)) this.send({ action: 'stop', index }); }
  close() { for (const index of [...this.sessions.keys()]) this.stop(index); }
}

module.exports = { MacEngine, registerScheme, handleProtocol, rewritePlaylist, toProxy, fromProxy, streamKind };

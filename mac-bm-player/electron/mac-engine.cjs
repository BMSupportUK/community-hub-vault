/**
 * Mac playback engine. The main process keeps provider URLs private: the
 * renderer only ever sees short-lived bmstream://<token>/... addresses, and this
 * module proxies them to the provider (rewriting HLS playlists so every segment
 * also goes through the proxy). Playback itself happens in the renderer's
 * <video> element (hls.js / mpegts.js / native), which reports status back.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { Readable } = require('node:stream');

const SCHEME = 'bmstream';
const TOKEN_TTL_MS = 12 * 60 * 60_000;
const origins = new Map(); // token -> { origin, expires }
const byOrigin = new Map(); // origin -> token
let userAgent = () => '';

/*
 * BM backup engine: when the main player can't cope with a stream, the bundled
 * ffmpeg converts it on this computer to plain H.264/AAC MPEG-TS, which the
 * renderer's <video> always plays. Same idea as Android's built-in backup engine.
 */
const backups = new Map(); // token -> { url, ss, live, proc, duration }
// Packed (asar) apps keep the converter beside the archive in app.asar.unpacked, where it can be run.
function ffmpegPath() { return path.join(__dirname, '../tools/ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg').replace(/app\.asar(?=[\\/])/, 'app.asar.unpacked'); }
function backupReady() { try { return fs.statSync(ffmpegPath()).isFile(); } catch { return false; } }
function backupArgs(url, { ss = 0, ua = '', audioId = 0 } = {}) {
  const net = /^https?:/i.test(url) ? ['-user_agent', ua || 'VLC/3.0.21 LibVLC/3.0.21', '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_on_network_error', '1', '-reconnect_delay_max', '5'] : [];
  return ['-hide_banner', '-nostdin', '-loglevel', 'info', ...net,
    ...(ss > 0 ? ['-ss', String(Math.floor(ss))] : []), '-fflags', '+genpts+discardcorrupt', '-i', url,
    '-map', '0:v:0?', '-map', `0:a:${audioId}?`, '-sn', '-dn',
    '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-crf', '22', '-pix_fmt', 'yuv420p',
    '-vf', "scale=w='min(1920,iw)':h=-2", '-g', '50', '-c:a', 'aac', '-ac', '2', '-b:a', '160k', '-f', 'mpegts', 'pipe:1'];
}
function parseDuration(text) {
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(text));
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}
function parseTracks(text) {
  const rows={audio:[],subtitles:[]};
  for(const match of String(text).matchAll(/Stream #0:\d+(?:\[[^\]]+\])?(?:\(([^)]+)\))?: (Audio|Subtitle): ([^\n]+)/g)) {
    const key=match[2]==='Audio'?'audio':'subtitles';
    rows[key].push({id:rows[key].length,name:match[1]||`${key==='audio'?'Audio':'Subtitles'} ${rows[key].length+1}`});
  }
  return rows;
}
function killBackup(entry) { if (entry?.proc) { try { entry.proc.kill('SIGKILL'); } catch {} entry.proc = null; } }
function serveBackup(entry, request) {
  killBackup(entry);
  const proc = spawn(ffmpegPath(), backupArgs(entry.url, { ss: entry.ss, ua: userAgent(), audioId: entry.audioId }), { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  entry.proc = proc;
  let log = '';
  proc.stderr.on('data', d => { if (!entry.duration) { log = (log + d).slice(-8000); entry.duration = parseDuration(log); entry.tracks = parseTracks(log); } });
  proc.on('error', () => {});
  request.signal?.addEventListener?.('abort', () => { if (entry.proc === proc) killBackup(entry); });
  return new Response(Readable.toWeb(proc.stdout), { status: 200, headers: { 'Content-Type': 'video/mp2t', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' } });
}

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

function serveSubtitles(entry, request, id) {
  if(!entry.tracks?.subtitles.some(t=>t.id===id))return new Response('Track unavailable',{status:404});
  const proc=spawn(ffmpegPath(), ['-hide_banner','-nostdin','-loglevel','error','-user_agent',userAgent()||'VLC/3.0.21',...(entry.ss>0?['-ss',String(entry.ss)]:[]),'-i',entry.url,'-map',`0:s:${id}`,'-f','webvtt','pipe:1'],{stdio:['ignore','pipe','ignore'],windowsHide:true});
  proc.on('error',()=>{});request.signal?.addEventListener('abort',()=>proc.kill('SIGKILL'));
  return new Response(Readable.toWeb(proc.stdout),{headers:{'Content-Type':'text/vtt','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
}
function handleProtocol(protocol) {
  protocol.handle(SCHEME, async request => {
    const host = new URL(request.url).hostname;
    if (host.startsWith('backup-')) {
      const entry = backups.get(host.slice(7));
      const subtitle=/\/subtitles\/(\d+)\.vtt$/.exec(new URL(request.url).pathname);
      if(entry&&subtitle)return serveSubtitles(entry,request,Number(subtitle[1]));
      return entry ? serveBackup(entry, request) : new Response('Stream expired', { status: 404 });
    }
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
  play(index, url, { buffer = 3000, resume = 0, live = true, subtitles = null, fill = false, steady = false } = {}) {
    const src = toProxy(url);
    this.sessions.set(index, { position: 0, duration: 0, state: 1, seekable: false });
    this.endBackup(index);
    this.send({ action: 'play', index, src, kind: streamKind(url), buffer: Number(buffer) || 3000, resume: Number(resume) || 0, live: live !== false, subtitles, fill: !!fill, steady });
  }
  backupReady() { return backupReady(); }
  /** Play through the backup engine; films, episodes and catch up keep their place (seeking restarts the conversion there). */
  playBackup(index, url, { buffer = 3000, resume = 0, live = true, fill = false, steady = false, audioId = 0, subtitleId = -1, tracks = null, paused = false, rate = 1 } = {}) {
    this.endBackup(index);
    const token = crypto.randomBytes(12).toString('hex'), ss = live ? 0 : Math.max(0, Number(resume) || 0);
    backups.set(token, { url, ss, live, proc: null, duration: 0, audioId, tracks });
    const old = this.sessions.get(index);
    this.sessions.set(index, { position: 0, duration: 0, state: 1, seekable: false, backup: { token, url, live, offset: ss, buffer,steady,fill,audioId,subtitleId,rate,paused }, volume: old?.volume });
    this.send({ action: 'play', index, src: `${SCHEME}://backup-${token}/stream.ts`, kind: 'ts', buffer: Number(buffer) || 3000, resume: 0, live: true, subtitles: null, fill: !!fill, steady });
    if(subtitleId>=0)this.send({action:'subtitleSource',index,src:`${SCHEME}://backup-${token}/subtitles/${subtitleId}.vtt`});
    if(rate!==1)this.send({action:'speed',index,rate});
    if(paused)this.send({action:'pause',index,paused:true});
    if (old?.volume !== undefined) this.send({ action: 'volume', index, volume: old.volume });
  }
  endBackup(index) { const b = this.sessions.get(index)?.backup; if (b) { killBackup(backups.get(b.token)); backups.delete(b.token); } }
  report(value) {
    const index = Number(value?.index);
    const s = this.sessions.get(index);
    if (!s) return;
    const num = v => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
    s.position = num(value.position);
    s.duration = num(value.duration);
    s.state = [1, 2, 3, 4, 5, 6, 7].includes(Number(value.state)) ? Number(value.state) : s.state;
    s.seekable = !!value.seekable;
    s.tracks = {audio:Array.isArray(value.audioTracks)?value.audioTracks.slice(0,50):[],subtitles:Array.isArray(value.subtitleList)?value.subtitleList.slice(0,50):[],audioId:Number(value.audioId),subtitleId:Number(value.subtitleId)};
    s.subs = Math.max(0, Math.min(50, Number(value.subs) || 0));
    s.w = Math.max(0, Math.min(10000, Number(value.w) || 0)); s.h = Math.max(0, Math.min(10000, Number(value.h) || 0));
  }
  status(index) {
    const s = this.sessions.get(index);
    if (!s) return null;
    if (!s.backup) return { position: s.position, duration: s.duration, state: s.state, seekable: s.seekable, subs: s.subs || 0, w: s.w || 0, h: s.h || 0 };
    const duration = s.backup.live ? 0 : backups.get(s.backup.token)?.duration || 0;
    return { position: s.position + s.backup.offset, duration, state: s.state, seekable: duration > 0, backup: true };
  }
  subtitleTracks(index) { const s = this.sessions.get(index); return s && !s.backup ? s.subs || 0 : 0; }
  setSubtitles(index, on) { if (this.sessions.has(index)) this.send({ action: 'subtitles', index, on: !!on }); }
  tracks(index) { const s=this.sessions.get(index);if(!s)return{audio:[],subtitles:[]};if(s.backup){const t=backups.get(s.backup.token)?.tracks||{audio:[],subtitles:[]};return{...t,audioId:s.backup.audioId,subtitleId:s.backup.subtitleId};}return s.tracks||{audio:[],subtitles:[]}; }
  setAudioTrack(index,id) { const s=this.sessions.get(index);if(!s||!this.tracks(index).audio.some(t=>t.id===id))return;if(s.backup){const t=this.tracks(index);this.playBackup(index,s.backup.url,{...s.backup,resume:this.status(index).position,audioId:id,tracks:t});}else this.send({action:'audioTrack',index,id}); }
  setSubtitleTrack(index,id) { const s=this.sessions.get(index);if(!s||!(id===-1||this.tracks(index).subtitles.some(t=>t.id===id)))return;if(s.backup){s.backup.subtitleId=id;this.send({action:'subtitleSource',index,src:id<0?null:`${SCHEME}://backup-${s.backup.token}/subtitles/${id}.vtt`});}else this.send({action:'subtitleTrack',index,id}); }
  speed(index,rate) { const s=this.sessions.get(index);if(s){if(s.backup)s.backup.rate=rate;this.send({action:'speed',index,rate});} }
  layout() {}
  pause(index, paused) { const s=this.sessions.get(index);if(s?.backup)s.backup.paused=!!paused;if (s) this.send({ action: 'pause', index, paused: !!paused }); }
  seek(index, seconds) {
    const s = this.sessions.get(index);
    if (!s) return;
    if (s.backup) { if (!s.backup.live) this.playBackup(index, s.backup.url, { ...s.backup, tracks:this.tracks(index),resume: seconds, live: false }); return; }
    this.send({ action: 'seek', index, seconds });
  }
  volume(index, value) { const s = this.sessions.get(index); if (s) { s.volume = value; this.send({ action: 'volume', index, volume: value }); } }
  stop(index) { this.endBackup(index); if (this.sessions.delete(index)) this.send({ action: 'stop', index }); }
  close() { for (const index of [...this.sessions.keys()]) this.stop(index); }
}

module.exports = { MacEngine, backupArgs, parseDuration, parseTracks, registerScheme, handleProtocol, rewritePlaylist, toProxy, fromProxy, streamKind };

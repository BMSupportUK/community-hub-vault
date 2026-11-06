import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { contentShare, BarTracker } from '../../windows-bm-player/letterbox.cjs';

// Windows plays through its own libVLC surfaces; this <video> only shows when the backup engine takes over.
const HIDE_IDLE = typeof window !== 'undefined' && window.bm?.platform === 'windows';
// Latest command per screen, kept even before the video element mounts.
const commands = new Map();
const elements = new Map();
const players = new Map();

// Sound booster: volumes above 100 go through a Web Audio gain node (a <video> stops at 1.0).
const boosters = new Map();
function setLoudness(index, video, volume) {
  const v = Math.max(0, Math.min(250, Number(volume) || 0)) / 100;
  video.volume = Math.min(1, v);
  let b = boosters.get(index);
  if (v > 1 && (!b || b.video !== video)) {
    try { const ctx = new AudioContext(); const gain = ctx.createGain(); ctx.createMediaElementSource(video).connect(gain).connect(ctx.destination); b = { ctx, gain, video }; boosters.set(index, b); } catch { b = null; }
  }
  if (b && b.video === video) { b.gain.gain.value = Math.max(1, v); b.ctx.resume?.().catch(() => {}); }
}
function destroy(index) {
  const p = players.get(index);
  if (p) { try { p.destroy(); } catch {} players.delete(index); }
  const video = elements.get(index);
  if (video) { video.pause(); video.removeAttribute('src'); video.load(); if (HIDE_IDLE) video.style.visibility = 'hidden'; }
}

function start(index) {
  const cmd = commands.get(index), video = elements.get(index);
  if (!cmd || !video || cmd.action !== 'play') return;
  destroy(index);
  video.style.visibility = 'visible';
  video.dataset.failed = '';
  const fail = () => { video.dataset.failed = '1'; };
  // UHD memory cap (same idea as Android 3.52): played picture is dropped and saved picture is limited in MB, so 4K streams never fill the app's memory.
  const seconds = Math.max(2, Math.round(cmd.buffer / 1000));
  if (cmd.kind === 'hls' && Hls.isSupported()) {
    const hls = new Hls({ enableWorker: false, maxBufferLength: Math.max(10, seconds * 3), maxBufferSize: 48 * 1024 * 1024, backBufferLength: 10, ...(cmd.live !== false ? { liveSyncDuration: seconds, liveMaxLatencyDuration: seconds + 20 } : {}) });
    hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) fail(); });
    if (cmd.subtitles != null) {
      hls.subtitleDisplay = cmd.subtitles === true;
      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => { hls.subtitleTrack = cmd.subtitles && hls.subtitleTracks.length ? 0 : -1; });
    }
    hls.loadSource(cmd.src); hls.attachMedia(video); players.set(index, hls);
  } else if (cmd.kind === 'ts' && mpegts.isSupported()) {
    // Catch up recordings are finite: play them as files so the length and seek bar work.
    const live = cmd.live !== false;
    const p = mpegts.createPlayer({ type: 'mpegts', isLive: live, url: cmd.src }, { enableWorker: false, liveBufferLatencyChasing: live, liveBufferLatencyMaxLatency: seconds + 20, liveBufferLatencyMinRemain: seconds, stashInitialSize: 384 * 1024, autoCleanupSourceBuffer: true, autoCleanupMaxBackwardDuration: 20, autoCleanupMinBackwardDuration: 10 });
    p.on(mpegts.Events.ERROR, fail);
    p.attachMediaElement(video); p.load(); players.set(index, p);
  } else {
    video.src = cmd.src;
  }
  if (cmd.subtitles != null) {
    // Subtitles on shows the first text track; off hides every track.
    const setText = () => { const t = [...video.textTracks]; t.forEach((x, i) => { x.mode = cmd.subtitles && i === 0 ? 'showing' : 'disabled'; }); };
    video.textTracks.addEventListener?.('addtrack', setText); video.addEventListener('loadedmetadata', setText, { once: true });
  }
  if (cmd.resume > 0) video.addEventListener('loadedmetadata', () => { try { video.currentTime = cmd.resume; } catch {} }, { once: true });
  video.style.objectFit = cmd.fill ? 'cover' : 'contain';
  video.style.transform = ''; video._bars = cmd.fill ? new BarTracker() : null;
  video.play().catch(() => {});
}

function apply(data) {
  if (data?.type !== 'video') return;
  const index = Number(data.index);
  const video = elements.get(index);
  if (data.action === 'play') { commands.set(index, data); start(index); }
  else if (data.action === 'stop') { commands.delete(index); destroy(index); }
  else if (!video) return;
  else if (data.action === 'pause') data.paused ? video.pause() : video.play().catch(() => {});
  else if (data.action === 'seek') { try { video.currentTime = data.seconds; } catch {} }
  else if (data.action === 'subtitles') {
    const p = players.get(index);
    if (p instanceof Hls) { p.subtitleDisplay = data.on; p.subtitleTrack = data.on && p.subtitleTracks.length ? 0 : -1; }
    [...video.textTracks].forEach((x, i) => { x.mode = data.on && i === 0 ? 'showing' : 'disabled'; });
  }
  else if (data.action === 'volume') setLoudness(index, video, data.volume);
}

// Films/episodes: every 2s sample a tiny frame and scale past black bars baked into the picture.
const barCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
if (barCanvas) { barCanvas.width = 96; barCanvas.height = 54; }
if (typeof window !== 'undefined') setInterval(() => {
  for (const video of elements.values()) {
    if (!video?._bars || video.paused || video.readyState < 2) continue;
    try {
      const ctx = barCanvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, 96, 54);
      if (video._bars.push(contentShare(ctx.getImageData(0, 0, 96, 54).data, 96, 54))) video.style.transform = `scale(${1 / video._bars.share})`;
    } catch {}
  }
}, 2000);

if (window.bm) {
  window.bm.subscribe(apply);
  setInterval(() => {
    for (const [index, video] of elements) {
      if (!commands.has(index)) continue;
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      const state = video.dataset.failed || video.error ? 7 : video.ended ? 6 : video.paused ? 4 : video.readyState < 3 ? 2 : 3;
      const p = players.get(index), subs = p instanceof Hls ? p.subtitleTracks.length : video.textTracks.length;
      window.bm.videoStatus({ index, position: video.currentTime || 0, duration, state, seekable: duration > 0, subs, w: video.videoWidth || 0, h: video.videoHeight || 0 }).catch(() => {});
    }
  }, 1000);
}

export function MacVideo({ index }) {
  const ref = useRef(null);
  useEffect(() => {
    elements.set(index, ref.current);
    start(index);
    return () => { destroy(index); elements.delete(index); };
  }, [index]);
  return <video ref={ref} className="mac-video" playsInline autoPlay style={{ visibility: HIDE_IDLE ? 'hidden' : 'visible', width: '100%', height: '100%', objectFit: 'contain', background: '#000', display: 'block' }} />;
}

window.__bmMacVideo = MacVideo;

// Shared audio playback helper.
//
// Playback strategy (in order):
//   1. Web Audio AudioBufferSourceNode — the file is fetched once and decoded
//      into an AudioBuffer. This is the only reliable way to play a sound from
//      a timer / realtime handler, and it allows gain above the HTMLAudio 1.0
//      ceiling.
//   2. Plain HTMLAudioElement — used when the AudioContext is unavailable or
//      still suspended (no user gesture yet), and as a hard fallback.
//
// IMPORTANT: we deliberately do NOT use createMediaElementSource(). Routing an
// <audio> element into the AudioContext permanently redirects its output into
// the graph, so if the context is suspended (autoplay policy) play() resolves
// successfully but nothing is ever audible — the exact "no sound, no error"
// failure this helper used to hit.

const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const elements = new Map<string, HTMLAudioElement>();
const activeGestureElements = new Set<HTMLAudioElement>();
const registeredSources = new Set<string>();
const pendingPlayback = new Map<string, () => void>();

let ctx: AudioContext | null = null;
let unlocked = false;
let listenersAttached = false;
let retryListenersAttached = false;

// ---------- User preferences (per-device, localStorage) ----------

const PREFS_KEY = "sound-prefs:v1";
const PREFS_EVENT = "sound-prefs-changed";

export interface SoundPrefs {
  /** 0..2 — overall multiplier applied on top of per-call gain. */
  volume: number;
  /** When true, no sounds play. */
  muted: boolean;
}

const DEFAULT_PREFS: SoundPrefs = { volume: 1, muted: false };

export function getSoundPrefs(): SoundPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<SoundPrefs>;
    return {
      volume: typeof parsed.volume === "number" ? Math.max(0, Math.min(2, parsed.volume)) : 1,
      muted: !!parsed.muted,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function setSoundPrefs(next: Partial<SoundPrefs>) {
  if (typeof window === "undefined") return;
  const merged = { ...getSoundPrefs(), ...next };
  merged.volume = Math.max(0, Math.min(2, merged.volume));
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent(PREFS_EVENT));
  } catch { /* noop */ }
}

export function onSoundPrefsChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(PREFS_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(PREFS_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// ---------- Audio graph ----------

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

function getElement(src: string): HTMLAudioElement {
  let el = elements.get(src);
  if (!el) {
    el = new Audio(src);
    el.preload = "auto";
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    elements.set(src, el);
  }
  return el;
}

function loadBuffer(src: string): Promise<AudioBuffer | null> {
  const cached = buffers.get(src);
  if (cached) return Promise.resolve(cached);
  const inflight = loading.get(src);
  if (inflight) return inflight;
  const c = getCtx();
  if (!c) return Promise.resolve(null);
  const p = (async () => {
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      const buf = await c.decodeAudioData(bytes.slice(0));
      buffers.set(src, buf);
      return buf;
    } catch (err) {
      console.warn("[sound] decode failed:", src, (err as Error)?.message ?? err);
      return null;
    } finally {
      loading.delete(src);
    }
  })();
  loading.set(src, p);
  return p;
}

/** Preload + register sounds and wire the first-gesture unlock. */
export function ensureSoundUnlocked(sources: string[] = []) {
  if (typeof window === "undefined") return;
  sources.forEach((src) => {
    registeredSources.add(src);
    getElement(src);
    void loadBuffer(src);
  });
  ensureUnlockListeners();
}

function resumeCtx() {
  const c = getCtx();
  if (c && c.state !== "running") c.resume().catch(() => {});
}

function ensureUnlockListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    resumeCtx();
    registeredSources.forEach((src) => void loadBuffer(src));
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
  };

  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
  window.addEventListener("touchstart", unlock, { capture: true, passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resumeCtx();
  });
}

function retryOnNextGesture(key: string, replay: () => void) {
  if (typeof window === "undefined") return;
  pendingPlayback.set(key, replay);
  if (retryListenersAttached) return;
  retryListenersAttached = true;
  const retry = () => {
    retryListenersAttached = false;
    const queued = [...pendingPlayback.values()];
    pendingPlayback.clear();
    window.removeEventListener("pointerdown", retry, true);
    window.removeEventListener("keydown", retry, true);
    window.removeEventListener("touchstart", retry, true);
    queued.forEach((run) => run());
  };
  window.addEventListener("pointerdown", retry, { capture: true, once: true });
  window.addEventListener("keydown", retry, { capture: true, once: true });
  window.addEventListener("touchstart", retry, { capture: true, once: true });
}

/**
 * Play a notification sound. Safe to call from realtime handlers / timers.
 * `gain` boosts above 1.0 via Web Audio (default 1.8); the HTMLAudio fallback
 * is clamped to 1.0.
 */
export function playSound(
  src: string,
  opts: { volume?: number; gain?: number; label?: string } = {},
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  ensureUnlockListeners();
  registeredSources.add(src);

  const prefs = getSoundPrefs();
  if (prefs.muted) return Promise.resolve(false);

  const { volume = 1.0, gain = 1.8, label } = opts;
  const name = label ?? src;
  const level = Math.max(0, volume * gain * prefs.volume);

  return (async () => {
    // --- 1. Web Audio buffer path ---
    const c = getCtx();
    if (c) {
      if (c.state !== "running") {
        try { await c.resume(); } catch { /* noop */ }
      }
      if (c.state === "running") {
        const buf = await loadBuffer(src);
        if (buf) {
          try {
            const source = c.createBufferSource();
            source.buffer = buf;
            const gainNode = c.createGain();
            gainNode.gain.value = level;
            source.connect(gainNode).connect(c.destination);
            source.start(0);
            return true;
          } catch (err) {
            console.warn(`[sound] webaudio play failed (${name}):`, (err as Error)?.message ?? err);
          }
        }
      }
    }

    // --- 2. Plain HTMLAudio fallback ---
    const el = getElement(src);
    el.muted = false;
    el.volume = Math.max(0, Math.min(1, level));
    try {
      try { el.currentTime = 0; } catch { /* noop */ }
      const p = el.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch (err) {
      console.warn(`[sound] element play failed (${name}):`, (err as Error)?.message ?? err);
      retryOnNextGesture(name, () => { void playSound(src, opts); });
      return false;
    }
  })();
}

/**
 * Play directly from a user click/tap. This deliberately creates a fresh
 * element and calls play() before yielding, preserving the browser/WebView's
 * user-activation token. Use this for Test/Preview controls; realtime alerts
 * should continue to use playSound().
 */
export function playSoundFromGesture(
  src: string,
  opts: { volume?: number; gain?: number; label?: string; ignoreMute?: boolean } = {},
): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  const prefs = getSoundPrefs();
  if (prefs.muted && !opts.ignoreMute) return Promise.resolve(false);

  const { volume = 1, gain = 1.8, label } = opts;
  const level = Math.max(0, Math.min(1, volume * gain * prefs.volume));
  const el = new Audio();
  el.preload = "auto";
  el.src = src;
  el.muted = false;
  el.volume = level;
  (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  activeGestureElements.add(el);

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      el.removeEventListener("playing", onPlaying);
      el.removeEventListener("error", onError);
      resolve(ok);
    };
    const release = () => activeGestureElements.delete(el);
    const onPlaying = () => finish(true);
    const onError = () => {
      const detail = el.error?.message || `media error ${el.error?.code ?? "unknown"}`;
      console.warn(`[sound] direct play failed (${label ?? src}):`, detail);
      finish(false);
    };
    el.addEventListener("playing", onPlaying, { once: true });
    el.addEventListener("error", onError, { once: true });
    el.addEventListener("ended", release, { once: true });
    el.addEventListener("abort", release, { once: true });
    el.addEventListener("error", release, { once: true });

    try {
      const started = el.play();
      if (started && typeof started.catch === "function") {
        started.catch((err) => {
          console.warn(`[sound] direct play blocked (${label ?? src}):`, (err as Error)?.message ?? err);
          finish(false);
        });
      }
    } catch (err) {
      console.warn(`[sound] direct play threw (${label ?? src}):`, (err as Error)?.message ?? err);
      finish(false);
    }
  });
}

// Exposed for diagnostics: window.__bmPlaySound("/src/assets/…mp3")
if (typeof window !== "undefined") {
  (window as unknown as { __bmPlaySound?: typeof playSound }).__bmPlaySound = playSound;
}

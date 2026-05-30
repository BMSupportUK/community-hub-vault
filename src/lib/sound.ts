// Shared audio playback helper. Preloads sounds, unlocks playback on the
// first user gesture, and routes through the Web Audio API with a GainNode
// so we can boost output above the HTMLAudio 1.0 ceiling. Plays reliably
// while the tab is backgrounded once it has been unlocked.

type Entry = { el: HTMLAudioElement; source?: MediaElementAudioSourceNode; gainNode?: GainNode };

const cache = new Map<string, Entry>();
let unlocked = false;
let listenersAttached = false;
let ctx: AudioContext | null = null;

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

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const AC: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC(); } catch { ctx = null; }
  return ctx;
}

function ensureUnlockListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    cache.forEach((e) => primeAudio(e.el));
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  });
}

function primeAudio(a: HTMLAudioElement) {
  try {
    a.muted = true;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        a.pause();
        a.currentTime = 0;
        a.muted = false;
      }).catch(() => { a.muted = false; });
    }
  } catch {
    a.muted = false;
  }
}

function getEntry(src: string, volume: number, gain: number): Entry {
  let e = cache.get(src);
  if (!e) {
    const el = new Audio(src);
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    e = { el };
    const c = getCtx();
    if (c) {
      try {
        const source = c.createMediaElementSource(el);
        const gainNode = c.createGain();
        source.connect(gainNode).connect(c.destination);
        e.source = source;
        e.gainNode = gainNode;
      } catch {
        // ignore — fall back to plain element volume
      }
    }
    cache.set(src, e);
    if (unlocked) primeAudio(el);
  }
  e.el.volume = Math.max(0, Math.min(1, volume));
  if (e.gainNode) {
    try { e.gainNode.gain.value = Math.max(0, gain); } catch { /* noop */ }
  }
  return e;
}

/**
 * Play a notification sound. Safe to call from realtime handlers / timers —
 * sound will play once the user has interacted with the page at least once.
 * `gain` boosts above 1.0 via Web Audio (default 1.8).
 */
export function playSound(
  src: string,
  opts: { volume?: number; gain?: number; label?: string } = {},
) {
  if (typeof window === "undefined") return;
  ensureUnlockListeners();
  const prefs = getSoundPrefs();
  if (prefs.muted) return;
  const { volume = 1.0, gain = 1.8, label } = opts;
  void (async () => {
    const c = getCtx();
    if (c && c.state === "suspended") {
      try { await c.resume(); } catch { /* noop */ }
    }
    const e = getEntry(src, volume, gain * prefs.volume);
    const tryPlay = async (el: HTMLAudioElement) => {
      try { el.currentTime = 0; } catch { /* noop */ }
      const p = el.play();
      if (p && typeof p.then === "function") await p;
    };
    try {
      await tryPlay(e.el);
      return;
    } catch (err) {
      console.warn(`[sound] primary play failed${label ? ` (${label})` : ""}:`, (err as Error)?.message ?? err);
    }
    // Fallback: plain HTMLAudio with no WebAudio routing — bypasses any
    // stale MediaElementSource state after long-backgrounded tabs.
    try {
      const fallback = new Audio(src);
      (fallback as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
      fallback.volume = Math.max(0, Math.min(1, volume * Math.min(1, prefs.volume)));
      await tryPlay(fallback);
    } catch (err) {
      console.warn(`[sound] fallback play failed${label ? ` (${label})` : ""}:`, (err as Error)?.message ?? err);
    }
  })();
}
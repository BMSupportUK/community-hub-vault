// Shared audio playback helper. Preloads sounds, unlocks playback on the
// first user gesture, and routes through the Web Audio API with a GainNode
// so we can boost output above the HTMLAudio 1.0 ceiling. Plays reliably
// while the tab is backgrounded once it has been unlocked.

type Entry = {
  el: HTMLAudioElement;
  direct: HTMLAudioElement;
  source?: MediaElementAudioSourceNode;
  gainNode?: GainNode;
};

const cache = new Map<string, Entry>();
let unlocked = false;
let listenersAttached = false;
let ctx: AudioContext | null = null;
const registeredSources = new Set<string>();

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

export function ensureSoundUnlocked(sources: string[] = []) {
  if (typeof window === "undefined") return;
  sources.forEach((src) => {
    registeredSources.add(src);
    getEntry(src, 1, 1);
  });
  ensureUnlockListeners();
}

function ensureUnlockListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    registeredSources.forEach((src) => getEntry(src, 1, 1));
    cache.forEach((e) => {
      primeAudio(e.el);
      primeAudio(e.direct);
    });
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  window.addEventListener("keydown", unlock, { capture: true });
  window.addEventListener("touchstart", unlock, { capture: true, passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
  });
}

function primeAudio(a: HTMLAudioElement) {
  const previousVolume = a.volume;
  try {
    a.muted = false;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = previousVolume;
      }).catch(() => { a.volume = previousVolume; });
    } else {
      a.pause();
      a.currentTime = 0;
      a.volume = previousVolume;
    }
  } catch {
    a.muted = false;
    a.volume = previousVolume;
  }
}

function getEntry(src: string, volume: number, gain: number): Entry {
  let e = cache.get(src);
  if (!e) {
    const el = new Audio(src);
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    (el as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    const direct = new Audio(src);
    direct.preload = "auto";
    (direct as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    e = { el, direct };
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
    if (unlocked) {
      primeAudio(el);
      primeAudio(direct);
    }
  }
  e.el.volume = Math.max(0, Math.min(1, volume));
  e.direct.volume = Math.max(0, Math.min(1, volume * Math.min(1, gain)));
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
    const tryPlay = async (el: HTMLAudioElement) => {
      try { el.currentTime = 0; } catch { /* noop */ }
      const p = el.play();
      if (p && typeof p.then === "function") await p;
    };

    // Backgrounded tabs: Chrome suspends AudioContext and won't resume it
    // until the tab is visible again — resume() resolves but the graph stays
    // silent. Plain HTMLAudio keeps playing in the background once unlocked,
    // so skip the WebAudio path entirely while hidden.
    const isHidden =
      typeof document !== "undefined" && document.visibilityState === "hidden";

    const c = getCtx();
    if (!isHidden && c && c.state === "suspended") {
      try { await c.resume(); } catch { /* noop */ }
    }

    const useFallbackFirst = isHidden || (c ? c.state !== "running" : false);

    const playDirect = async () => {
      const e = getEntry(src, volume, gain * prefs.volume);
      e.direct.volume = Math.max(0, Math.min(1, volume * Math.min(1, gain * prefs.volume)));
      await tryPlay(e.direct);
    };

    if (useFallbackFirst) {
      try {
        await playDirect();
        return;
      } catch (err) {
        console.warn(`[sound] background play failed${label ? ` (${label})` : ""}:`, (err as Error)?.message ?? err);
      }
    }

    const e = getEntry(src, volume, gain * prefs.volume);
    try {
      await tryPlay(e.el);
      return;
    } catch (err) {
      console.warn(`[sound] primary play failed${label ? ` (${label})` : ""}:`, (err as Error)?.message ?? err);
    }
    // Final fallback: plain HTMLAudio with no WebAudio routing.
    try {
      await playDirect();
    } catch (err) {
      console.warn(`[sound] fallback play failed${label ? ` (${label})` : ""}:`, (err as Error)?.message ?? err);
    }
  })();
}
// Shared audio playback helper that preloads sounds and unlocks playback on
// the first user gesture. Browsers block `new Audio().play()` triggered by
// timers or realtime subscriptions when there has been no prior user gesture
// in the document — this helper works around that and surfaces failures to
// the console instead of swallowing them.

const cache = new Map<string, HTMLAudioElement>();
let unlocked = false;
let listenersAttached = false;

function ensureUnlockListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    cache.forEach((a) => primeAudio(a));
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
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
      }).catch(() => {
        a.muted = false;
      });
    }
  } catch {
    a.muted = false;
  }
}

function getAudio(src: string, volume: number): HTMLAudioElement {
  let a = cache.get(src);
  if (!a) {
    a = new Audio(src);
    a.preload = "auto";
    cache.set(src, a);
    if (unlocked) primeAudio(a);
  }
  a.volume = volume;
  return a;
}

/**
 * Play a notification sound. Safe to call from realtime handlers / timers —
 * sound will play once the user has interacted with the page at least once.
 */
export function playSound(src: string, opts: { volume?: number; label?: string } = {}) {
  if (typeof window === "undefined") return;
  ensureUnlockListeners();
  const { volume = 0.9, label } = opts;
  const a = getAudio(src, volume);
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") {
      p.catch((err) => {
        console.warn(`[sound] play blocked${label ? ` (${label})` : ""}:`, err?.message ?? err);
      });
    }
  } catch (err) {
    console.warn(`[sound] play threw${label ? ` (${label})` : ""}:`, err);
  }
}
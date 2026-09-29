// Visual alert: briefly shakes the whole page so alerts are noticed even when
// sounds are muted, the volume is down, or the browser blocked audio playback.
//
// Respects the user's "reduce motion" accessibility setting and rate-limits
// itself so a burst of alerts doesn't shake endlessly.

const SHAKE_CLASS = "bm-screen-shake";
const SHAKE_MS = 900;
const COOLDOWN_MS = 2500;

let lastShake = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function shakeScreen(): void {
  if (typeof document === "undefined") return;
  if (prefersReducedMotion()) return;
  const now = Date.now();
  if (now - lastShake < COOLDOWN_MS) return;
  lastShake = now;

  const root = document.documentElement;
  root.classList.remove(SHAKE_CLASS);
  // Force a reflow so re-adding the class restarts the animation.
  void root.offsetWidth;
  root.classList.add(SHAKE_CLASS);

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    root.classList.remove(SHAKE_CLASS);
    timer = null;
  }, SHAKE_MS + 100);
}

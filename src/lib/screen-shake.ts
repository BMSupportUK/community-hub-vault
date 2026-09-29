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
  alertWhileHidden();
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

// ---- Minimised / background alert ----
// When the page is hidden (minimised, other tab, other window) a shake can't be
// seen, so flash the tab/taskbar title, add a red dot to the favicon and set
// the installed-app badge. Everything clears as soon as the user comes back.
let hiddenCount = 0;
let flashTimer: ReturnType<typeof setInterval> | null = null;
let savedTitle = "";
let savedIcon: string | null = null;
let listening = false;

function faviconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>("link[rel~='icon']");
}

function setBadgedFavicon(): void {
  const link = faviconLink();
  if (!link) return;
  if (savedIcon === null) savedIcon = link.href;
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 64, 64);
      ctx.fillStyle = "#e11d48";
      ctx.beginPath();
      ctx.arc(46, 18, 16, 0, Math.PI * 2);
      ctx.fill();
      link.href = c.toDataURL("image/png");
    } catch { /* tainted canvas — ignore */ }
  };
  img.src = savedIcon;
}

function clearHiddenAlert(): void {
  if (flashTimer) clearInterval(flashTimer);
  flashTimer = null;
  if (savedTitle) document.title = savedTitle;
  savedTitle = "";
  hiddenCount = 0;
  const link = faviconLink();
  if (link && savedIcon !== null) link.href = savedIcon;
  savedIcon = null;
  try { (navigator as Navigator & { clearAppBadge?: () => Promise<void> }).clearAppBadge?.(); } catch { /* ignore */ }
}

export function alertWhileHidden(): void {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") return;
  if (!listening) {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") clearHiddenAlert();
    });
    window.addEventListener("focus", clearHiddenAlert);
  }
  hiddenCount += 1;
  try { (navigator as Navigator & { setAppBadge?: (n: number) => Promise<void> }).setAppBadge?.(hiddenCount); } catch { /* ignore */ }
  setBadgedFavicon();
  if (!savedTitle) savedTitle = document.title;
  if (flashTimer) clearInterval(flashTimer);
  let on = false;
  const label = `🔴 (${hiddenCount}) New alert — BM Support`;
  flashTimer = setInterval(() => {
    on = !on;
    document.title = on ? label : savedTitle;
  }, 1000);
  document.title = label;
}

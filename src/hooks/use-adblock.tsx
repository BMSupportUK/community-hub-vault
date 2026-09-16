import { useEffect, useState } from "react";

export type AdBlockStatus = "checking" | "clean" | "blocked";

const STORAGE_KEY = "bm_adblock_state_v2";
const TTL_MS = 5 * 60 * 1000;
const BAIT_URL = "/api/public/ads/ad-banner-track.js";

let cached: AdBlockStatus | null = null;
let cachedAt = 0;
let inflight: Promise<AdBlockStatus> | null = null;
const listeners = new Set<(v: AdBlockStatus) => void>();

function emit(status: AdBlockStatus) {
  cached = status;
  cachedAt = Date.now();
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ value: status, at: cachedAt }));
  } catch {
    // Ignore storage failures.
  }
  listeners.forEach((l) => l(status));
}

function hydrate() {
  if (cached !== null || typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { value?: unknown; at?: number };
    if (typeof parsed.at !== "number") return;
    if (parsed.value === "clean" || parsed.value === "blocked") {
      cached = parsed.value;
      cachedAt = parsed.at;
    }
  } catch {
    // Ignore bad cache data.
  }
}

/** Decoy element using class/id names common filter lists hide. */
async function baitElementBlocked(): Promise<boolean> {
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "ad-banner ads ad-placement sponsor-slot adsbox";
    el.id = "ad-banner-sponsor-slot";
    el.setAttribute("data-ad-slot", "leaderboard");
    el.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:320px;height:90px;pointer-events:none;";
    el.innerHTML = "&nbsp;";
    document.body.appendChild(el);
    // Give extensions a tick to apply their cosmetic rules.
    window.setTimeout(() => {
      const style = window.getComputedStyle(el);
      const removed = !el.isConnected || !document.body.contains(el);
      const hidden =
        el.offsetHeight === 0 ||
        el.offsetParent === null ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0";
      el.remove();
      resolve(removed || hidden);
    }, 120);
  });
}

/** Request to a locally-served bait path that filter lists commonly block. */
async function baitRequestBlocked(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch(`${BAIT_URL}?t=${Date.now()}`, {
      cache: "no-store",
      signal: ctrl.signal,
    });
    window.clearTimeout(t);
    if (!res.ok) return false; // A server error is not proof of a blocker.
    const body = await res.text();
    return !body.includes("bm-ads-ok");
  } catch (e) {
    // A timeout/offline abort is inconclusive; an outright network refusal is not.
    if (e instanceof DOMException && e.name === "AbortError") return false;
    return true;
  }
}

/** Script-tag bait: blockers cancel the load and fire onerror. */
async function scriptBaitBlocked(): Promise<boolean> {
  return new Promise((resolve) => {
    const s = document.createElement("script");
    let done = false;
    const finish = (blocked: boolean) => {
      if (done) return;
      done = true;
      s.remove();
      resolve(blocked);
    };
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?t=${Date.now()}`;
    s.onload = () => finish(false);
    s.onerror = () => finish(true);
    window.setTimeout(() => finish(false), 3000);
    document.head.appendChild(s);
  });
}

/** Cross-origin bait: filter lists block these hosts outright. */
async function externalBaitBlocked(): Promise<boolean> {
  const urls = [
    "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js",
    "https://static.doubleclick.net/instream/ad_status.js",
  ];
  const results = await Promise.all(
    urls.map(async (u) => {
      try {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 2500);
        await fetch(`${u}?t=${Date.now()}`, { method: "GET", mode: "no-cors", cache: "no-store", signal: ctrl.signal });
        window.clearTimeout(t);
        return false;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return false;
        return true;
      }
    }),
  );
  return results.some(Boolean);
}

function run(force = false): Promise<AdBlockStatus> {
  hydrate();
  if (!force && cached !== null && Date.now() - cachedAt < TTL_MS) {
    return Promise.resolve(cached);
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [elementBlocked, requestBlocked, externalBlocked, scriptBlocked] = await Promise.all([
        baitElementBlocked(),
        baitRequestBlocked(),
        externalBaitBlocked(),
        scriptBaitBlocked(),
      ]);
      const status: AdBlockStatus =
        elementBlocked || requestBlocked || externalBlocked || scriptBlocked ? "blocked" : "clean";
      emit(status);
      return status;
    } catch {
      const status = cached ?? "clean";
      emit(status);
      return status;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Called by the sponsor banner when its real image fails to load. */
export function reportAdImageBlocked() {
  if (cached === "blocked") return;
  emit("blocked");
}

/** Force a fresh detection pass (the "Re-check" button). */
export function recheckAdBlock(): Promise<AdBlockStatus> {
  return run(true);
}

export function useAdBlockStatus(): AdBlockStatus {
  const [status, setStatus] = useState<AdBlockStatus>(() => {
    hydrate();
    return cached ?? "checking";
  });

  useEffect(() => {
    hydrate();
    if (cached !== null) setStatus(cached);
    const l = (v: AdBlockStatus) => setStatus(v);
    listeners.add(l);
    void run();
    return () => {
      listeners.delete(l);
    };
  }, []);

  return status;
}

import { useEffect, useState } from "react";
import { checkVisitorVpn } from "@/lib/vpn-public-check.functions";

let cached: boolean | null = null;
let cachedAt = 0;
let cachedIp: string | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();
const TTL_MS = 5 * 60 * 1000;
const STORAGE_KEY = "bm_visitor_vpn_cache";
type NavigatorWithConnection = Navigator & {
  connection?: EventTarget;
};

async function getPublicIp(): Promise<string | null> {
  const urls = [
    `https://api.ipify.org?format=json&t=${Date.now()}`,
    `https://api64.ipify.org?format=json&t=${Date.now()}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const data = (await res.json()) as { ip?: string };
      if (data.ip) return data.ip;
    } catch {
      // Try the next public IP resolver.
    }
  }
  return null;
}

function refresh(force = false): Promise<boolean> {
  hydrateCache();
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const ip = await getPublicIp();
      const ipChanged = !!ip && ip !== cachedIp;
      // Reuse the cached verdict only while it's fresh AND the public IP is unchanged.
      if (!force && !ipChanged && cached !== null && Date.now() - cachedAt < TTL_MS) {
        return cached;
      }
      cachedIp = ip ?? cachedIp;
      const res = await checkVisitorVpn({ data: { ip: cachedIp ?? undefined } });
      const flag = !!(res?.is_vpn || res?.is_proxy);
      cached = flag;
      cachedAt = Date.now();
      persistCache();
      listeners.forEach((l) => l(flag));
      return flag;
    } catch {
      return cached ?? false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

function hydrateCache() {
  if (cached !== null || typeof window === "undefined") return;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as { value?: boolean; at?: number; ip?: string | null };
    if (typeof parsed.value !== "boolean" || typeof parsed.at !== "number") return;
    cached = parsed.value;
    cachedAt = parsed.at;
    cachedIp = parsed.ip ?? null;
  } catch {
    // Ignore bad cache data.
  }
}

function persistCache() {
  if (typeof window === "undefined" || cached === null) return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ value: cached, at: cachedAt, ip: cachedIp }));
  } catch {
    // Ignore storage failures.
  }
}

export function useVisitorVpn() {
  const [isVpn, setIsVpn] = useState<boolean>(cached ?? false);

  useEffect(() => {
    hydrateCache();
    if (cached !== null) setIsVpn(cached);
    const l = (v: boolean) => setIsVpn(v);
    listeners.add(l);
    const start = () => void refresh();
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number }).requestIdleCallback;
    const idleId = idle ? idle(start, { timeout: 3500 }) : window.setTimeout(start, 2000);

    // refresh() itself re-checks the public IP first and only skips the
    // lookup when both the cache is fresh and the IP hasn't changed.
    const refreshIfStale = () => {
      void refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };
    const onOnline = () => void refresh(true);
    const poll = window.setInterval(refreshIfStale, 60_000);
    const connection = (navigator as NavigatorWithConnection).connection;
    window.addEventListener("focus", refreshIfStale);
    window.addEventListener("online", onOnline);
    connection?.addEventListener?.("change", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(l);
      if (idle) {
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId as number);
      } else {
        window.clearTimeout(idleId as number);
      }
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("online", onOnline);
      connection?.removeEventListener?.("change", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return isVpn;
}

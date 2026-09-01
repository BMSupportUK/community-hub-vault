import { useEffect, useState } from "react";
import { checkVisitorVpn } from "@/lib/vpn-public-check.functions";

export type VisitorVpnStatus = "checking" | "protected" | "unprotected" | "unavailable";

let cached: VisitorVpnStatus | null = null;
let cachedAt = 0;
let cachedIp: string | null = null;
let inflight: Promise<VisitorVpnStatus> | null = null;
const listeners = new Set<(v: VisitorVpnStatus) => void>();
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

function refresh(force = false): Promise<VisitorVpnStatus> {
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
      const status: VisitorVpnStatus = res?.checked === false
        ? "unavailable"
        : res?.is_vpn || res?.is_proxy
          ? "protected"
          : "unprotected";
      cached = status;
      cachedAt = Date.now();
      persistCache();
      listeners.forEach((l) => l(status));
      return status;
    } catch {
      const status = cached ?? "unavailable";
      listeners.forEach((l) => l(status));
      return status;
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
    const parsed = JSON.parse(raw) as { value?: unknown; at?: number; ip?: string | null };
    if (typeof parsed.at !== "number") return;
    if (parsed.value === true) cached = "protected";
    else if (parsed.value === false) cached = "unprotected";
    else if (["protected", "unprotected", "unavailable"].includes(String(parsed.value))) {
      cached = parsed.value as VisitorVpnStatus;
    } else return;
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
  const status = useVisitorVpnStatus();
  return status === "protected";
}

export function useVisitorVpnStatus() {
  const [status, setStatus] = useState<VisitorVpnStatus>(cached ?? "checking");

  useEffect(() => {
    hydrateCache();
    if (cached !== null) setStatus(cached);
    const l = (v: VisitorVpnStatus) => setStatus(v);
    listeners.add(l);
    void refresh();

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
      window.clearInterval(poll);
      window.removeEventListener("focus", refreshIfStale);
      window.removeEventListener("online", onOnline);
      connection?.removeEventListener?.("change", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return status;
}

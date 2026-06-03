import { useEffect, useState } from "react";
import { checkVisitorVpn } from "@/lib/vpn-public-check.functions";

let cached: boolean | null = null;
let cachedAt = 0;
let cachedIp: string | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();
const TTL_MS = 10_000;

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
  if (!force && inflight) return inflight;
  if (!force && cached !== null && Date.now() - cachedAt < TTL_MS) {
    return Promise.resolve(cached);
  }
  inflight = (async () => {
    try {
      const ip = await getPublicIp();
      cachedIp = ip ?? cachedIp;
      const res = await checkVisitorVpn({ data: { ip: cachedIp ?? undefined } });
      const flag = !!(res?.is_vpn || res?.is_proxy);
      cached = flag;
      cachedAt = Date.now();
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

export function useVisitorVpn() {
  const [isVpn, setIsVpn] = useState<boolean>(cached ?? false);

  useEffect(() => {
    const l = (v: boolean) => setIsVpn(v);
    listeners.add(l);
    void refresh();

    const interval = setInterval(() => refresh(true), TTL_MS);
    const onFocus = () => refresh(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    const onOnline = () => refresh(true);
    const connection = navigator.connection as (EventTarget & { addEventListener?: typeof window.addEventListener; removeEventListener?: typeof window.removeEventListener }) | undefined;
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    connection?.addEventListener?.("change", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(l);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      connection?.removeEventListener?.("change", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return isVpn;
}

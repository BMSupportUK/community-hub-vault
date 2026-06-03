import { useEffect, useState } from "react";
import { checkVisitorVpn } from "@/lib/vpn-public-check.functions";

let cached: boolean | null = null;
let cachedAt = 0;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();
const TTL_MS = 30_000;

function refresh(force = false): Promise<boolean> {
  if (!force && inflight) return inflight;
  if (!force && cached !== null && Date.now() - cachedAt < TTL_MS) {
    return Promise.resolve(cached);
  }
  inflight = (async () => {
    try {
      const res = await checkVisitorVpn();
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

    const interval = setInterval(() => refresh(true), 30_000);
    const onFocus = () => refresh(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(true);
    };
    const onOnline = () => refresh(true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      listeners.delete(l);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return isVpn;
}

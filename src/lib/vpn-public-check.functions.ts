import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.split(",")[0]?.trim().replace(/^\[|\]$/g, "") ?? "";
  const ip = raw.includes(":") ? raw.toLowerCase() : raw.replace(/:\d+$/, "");
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) return ip;
  if (/^[0-9a-f:]+$/i.test(ip) && ip.includes(":")) return ip;
  return null;
}

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

async function probe(ip: string): Promise<{ is_vpn: boolean; is_proxy: boolean } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const entry = (json[ip] as Record<string, unknown> | undefined) ?? {};
    const proxy = String(entry.proxy ?? "no").toLowerCase() === "yes";
    const type = String(entry.type ?? "").toLowerCase();
    return { is_proxy: proxy, is_vpn: proxy && (type === "vpn" || type.includes("vpn")) };
  } catch {
    return null;
  }
}

export const checkVisitorVpn = createServerFn({ method: "GET" }).handler(async () => {
  const candidate =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-real-ip") ??
    getRequestHeader("x-forwarded-for") ??
    getRequestIP({ xForwardedFor: true });
  const ip = normalizeIp(candidate) ?? "unknown";
  if (isPrivateIp(ip)) return { is_vpn: false, is_proxy: false, skipped: true };
  const result = await probe(ip);
  if (!result) return { is_vpn: false, is_proxy: false, skipped: true };
  return { ...result, skipped: false };
});
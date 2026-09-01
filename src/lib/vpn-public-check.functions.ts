import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";

type VpnCheckInput = { ip?: string };
type VpnVerdict = { is_vpn: boolean; is_proxy: boolean };

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

async function probe(ip: string): Promise<VpnVerdict | null> {
  const entry = await fetchProxycheckEntry(ip);
  return proxycheckVerdict(entry);
}


async function probeIpwhois(ip: string): Promise<VpnVerdict | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?security=1`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const entry = (await res.json()) as Record<string, unknown>;
    if (!entry.security || typeof entry.security !== "object") return null;
    const security = entry.security as Record<string, unknown>;
    const isVpn = security.vpn === true;
    const isProxy = security.proxy === true || security.tor === true || isVpn;
    return { is_vpn: isVpn, is_proxy: isProxy };
  } catch {
    return null;
  }
}

async function probeIpapi(ip: string): Promise<VpnVerdict | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const entry = (await res.json()) as Record<string, unknown>;
    const vpn = (entry.vpn ?? {}) as Record<string, unknown>;
    const isVpn = entry.is_vpn === true || vpn.is_vpn === true;
    const isProxy = entry.is_proxy === true || entry.is_datacenter === true || isVpn;
    const hasSecurityData =
      "is_vpn" in entry || "is_proxy" in entry || "is_datacenter" in entry || "is_vpn" in vpn;
    if (!hasSecurityData) return null;
    return { is_vpn: isVpn, is_proxy: isProxy };
  } catch {
    return null;
  }
}

async function probeIpquery(ip: string): Promise<VpnVerdict | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`https://api.ipquery.io/${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const entry = (await res.json()) as Record<string, unknown>;
    if (!entry.risk || typeof entry.risk !== "object") return null;
    const risk = entry.risk as Record<string, unknown>;
    const isVpn = risk.is_vpn === true;
    const isProxy = risk.is_proxy === true || risk.is_tor === true || risk.is_datacenter === true || isVpn;
    return { is_vpn: isVpn, is_proxy: isProxy };
  } catch {
    return null;
  }
}

export const checkVisitorVpn = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown): VpnCheckInput => {
    const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return { ip: typeof input.ip === "string" ? input.ip : undefined };
  })
  .handler(async ({ data }) => {
  const headerCandidate =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-real-ip") ??
    getRequestHeader("x-forwarded-for") ??
    getRequestIP({ xForwardedFor: true });
  const clientIp = normalizeIp(data.ip);
  const ip = clientIp ?? normalizeIp(headerCandidate) ?? "unknown";
  if (isPrivateIp(ip)) return { is_vpn: false, is_proxy: false, checked: false };

  // Query every provider and trust ANY positive detection. Free tiers of the
  // fallback APIs now omit their security block entirely, so a response full of
  // `false` values must never be allowed to override a positive verdict.
  const [primary, ipapi, ipwhois, ipquery] = await Promise.all([
    probe(ip),
    probeIpapi(ip),
    probeIpwhois(ip),
    probeIpquery(ip),
  ]);
  const results = [primary, ipapi, ipwhois, ipquery].filter(
    (r): r is VpnVerdict => r !== null,
  );
  if (results.length === 0) return { is_vpn: false, is_proxy: false, checked: false };
  const is_vpn = results.some((r) => r.is_vpn);
  const is_proxy = results.some((r) => r.is_proxy) || is_vpn;
  return { is_vpn, is_proxy, checked: true };
});

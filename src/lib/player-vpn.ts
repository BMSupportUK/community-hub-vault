/**
 * VPN / proxy verdicts for BM Player devices.
 *
 * Apps check in about every 60s, so a verdict is cached per IP in memory and
 * only re-asked once it goes stale — a household of TVs costs one lookup, not
 * one per poll. The same proxycheck.io / ipapi.is pair the website uses at
 * sign-in decides the answer, so the two surfaces never disagree.
 */
import { fetchProxycheckEntry, proxycheckVerdict, type ProxycheckEntry } from "./proxycheck.server";

export type VpnStatus = "yes" | "no" | "unknown";

/** A definite answer is trusted this long before being looked up again. */
export const VPN_CHECK_TTL_MS = 6 * 60 * 60_000;
/** "Couldn't tell" is retried much sooner than a real answer. */
export const VPN_RETRY_TTL_MS = 10 * 60_000;
const LOOKUP_TIMEOUT_MS = 2500;
const CACHE_LIMIT = 500;

/** Loopback, private, link-local, CGNAT and IPv6 unique-local addresses. */
export function isPublicIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const v = ip.trim().replace(/^\[|\]$/g, "");
  if (!v || v === "unknown") return false;
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) {
    const p = v.split(".").map(Number);
    if (!p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return false;
    if (p[0] === 0 || p[0] === 10 || p[0] === 127) return false;
    if (p[0] === 192 && p[1] === 168) return false;
    if (p[0] === 169 && p[1] === 254) return false;
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return false;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return false;
    return true;
  }
  const low = v.toLowerCase();
  if (low === "::1" || low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")) return false;
  return /^[0-9a-f:]+$/.test(low) && low.includes(":");
}

export function vpnTtlFor(status: string | null | undefined): number {
  return status === "yes" || status === "no" ? VPN_CHECK_TTL_MS : VPN_RETRY_TTL_MS;
}

/**
 * Whether this check-in should ask the IP services again: never for a private
 * address, immediately when nothing is known, otherwise only once the last
 * answer has aged out.
 */
export function needsVpnCheck(input: {
  ip: string | null;
  checkedAt: string | null;
  status: string | null;
  now?: number;
}): boolean {
  if (!isPublicIp(input.ip)) return false;
  if (!input.checkedAt) return true;
  const at = new Date(input.checkedAt).getTime();
  if (!Number.isFinite(at)) return true;
  return (input.now ?? Date.now()) - at >= vpnTtlFor(input.status);
}

export function vpnStatusFromVerdict(v: { is_proxy: boolean; is_vpn: boolean } | null): VpnStatus {
  if (!v) return "unknown";
  return v.is_vpn || v.is_proxy ? "yes" : "no";
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null);

function proxycheckProvider(entry: ProxycheckEntry): string | null {
  const operator = (entry.operator ?? {}) as Record<string, unknown>;
  return text(operator.name) ?? text(entry.provider) ?? text(entry.organisation) ?? text(entry.isp) ?? null;
}

async function askProxycheck(ip: string): Promise<{ status: VpnStatus; provider: string | null } | null> {
  const entry = await fetchProxycheckEntry(ip, LOOKUP_TIMEOUT_MS);
  const verdict = proxycheckVerdict(entry);
  if (!verdict || !entry) return null;
  return { status: vpnStatusFromVerdict(verdict), provider: proxycheckProvider(entry) };
}

/** Same second source the sign-in gate falls back to when proxycheck is silent. */
async function askIpapi(ip: string): Promise<{ status: VpnStatus; provider: string | null } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
    const res = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const e = (await res.json()) as Record<string, unknown>;
    if (typeof e.is_vpn !== "boolean" && typeof e.is_proxy !== "boolean") return null;
    const vpn = (e.vpn ?? {}) as Record<string, unknown>;
    const company = (e.company ?? {}) as Record<string, unknown>;
    const isVpn = e.is_vpn === true || vpn.is_vpn === true;
    const isProxy = e.is_proxy === true || isVpn;
    return {
      status: isVpn || isProxy ? "yes" : "no",
      provider: (isVpn || isProxy ? text(vpn.service) : null) ?? text(company.name),
    };
  } catch {
    return null;
  }
}

/** Ask the IP services once; proxycheck first, ipapi.is to confirm a clean bill. */
export async function lookupVpn(ip: string): Promise<{ status: VpnStatus; provider: string | null }> {
  const first = await askProxycheck(ip);
  if (first && first.status === "yes") return first;
  const second = await askIpapi(ip);
  if (second && second.status === "yes") return second;
  return first ?? second ?? { status: "unknown", provider: null };
}

type Cached = { at: number; status: VpnStatus; provider: string | null };
const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Cached>>();

const toFields = (c: Cached) => ({
  vpn_status: c.status,
  vpn_provider: c.provider,
  vpn_checked_at: new Date(c.at).toISOString(),
});

/**
 * Verdict columns for one check-in IP, served from memory when a fresh answer
 * is already held so the app's poll never waits on an outside lookup.
 */
export async function checkDeviceVpn(ip: string, now = Date.now()): Promise<Record<string, string | null>> {
  const hit = cache.get(ip);
  if (hit && now - hit.at < vpnTtlFor(hit.status)) return toFields(hit);
  let run = inflight.get(ip);
  if (!run) {
    if (cache.size >= CACHE_LIMIT) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    run = lookupVpn(ip)
      .then((r) => {
        const rec: Cached = { at: Date.now(), status: r.status, provider: r.provider };
        cache.set(ip, rec);
        return rec;
      })
      .finally(() => {
        if (inflight.get(ip) === run) inflight.delete(ip);
      });
    inflight.set(ip, run);
  }
  return toFields(await run);
}

/** Test hook: forget every cached verdict. */
export function clearVpnCache() {
  cache.clear();
  inflight.clear();
}

const mobileCache = new Map<string, { at: number; mobile: boolean | null }>();
/** Whether an IP belongs to a mobile-data network (ipapi.is), cached 6 hours; null when unknown. */
export async function lookupMobile(ip: string, now = Date.now()): Promise<boolean | null> {
  const hit = mobileCache.get(ip);
  if (hit && now - hit.at < (hit.mobile === null ? VPN_RETRY_TTL_MS : VPN_CHECK_TTL_MS)) return hit.mobile;
  let mobile: boolean | null = null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), LOOKUP_TIMEOUT_MS);
    const res = await fetch(`https://api.ipapi.is/?q=${encodeURIComponent(ip)}`, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    clearTimeout(t);
    if (res.ok) { const e = (await res.json()) as Record<string, unknown>; if (typeof e.is_mobile === "boolean") mobile = e.is_mobile; }
  } catch { /* unknown */ }
  if (mobileCache.size >= CACHE_LIMIT) mobileCache.clear();
  mobileCache.set(ip, { at: now, mobile });
  return mobile;
}

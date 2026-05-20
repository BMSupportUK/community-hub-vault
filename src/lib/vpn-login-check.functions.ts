import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

async function checkVpn(ip: string) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(
      `https://proxycheck.io/v2/${encodeURIComponent(ip)}?vpn=1&asn=1&risk=1`,
      { signal: ctrl.signal, headers: { Accept: "application/json" } },
    );
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const entry = (json[ip] ?? {}) as Record<string, unknown>;
    const proxy = String(entry.proxy ?? "no").toLowerCase() === "yes";
    const type = String(entry.type ?? "").toLowerCase();
    return {
      is_proxy: proxy,
      is_vpn: proxy && type === "vpn",
      vpn_provider: (entry.provider as string) ?? (entry.organisation as string) ?? null,
      isp: (entry.isp as string) ?? null,
      country: (entry.country as string) ?? null,
      region: (entry.region as string) ?? null,
      city: (entry.city as string) ?? null,
      vpn_raw: entry,
    };
  } catch {
    return null;
  }
}

export const checkMyVpnOnLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const ip =
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-real-ip") ??
      "unknown";

    if (isPrivateIp(ip)) return { ok: false, skipped: true, ip };

    const vpn = await checkVpn(ip);
    if (!vpn) return { ok: false, ip };

    const { error } = await supabase.rpc("upsert_my_signup_vpn" as never, {
      _ip: ip,
      _is_vpn: vpn.is_vpn,
      _is_proxy: vpn.is_proxy,
      _vpn_provider: vpn.vpn_provider,
      _isp: vpn.isp,
      _country: vpn.country,
      _region: vpn.region,
      _city: vpn.city,
      _vpn_raw: vpn.vpn_raw,
    } as never);
    if (error) throw error;

    return { ok: true, ip, is_vpn: vpn.is_vpn, is_proxy: vpn.is_proxy };
  });
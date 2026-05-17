import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function checkVpn(ip: string) {
  if (!ip || ip === "unknown" || ip.startsWith("127.") || ip.startsWith("::1")) {
    return null;
  }
  try {
    // proxycheck.io: free tier, no key required, ~1000/day per IP
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

export const recordSignupInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { client: Record<string, unknown> }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ip =
      getRequestIP({ xForwardedFor: true }) ??
      getRequestHeader("cf-connecting-ip") ??
      getRequestHeader("x-real-ip") ??
      "unknown";
    const ua = getRequestHeader("user-agent") ?? null;
    const c = data.client ?? {};
    const s = (v: unknown) => (v == null ? null : String(v));

    const vpn = await checkVpn(ip);

    const { error } = await supabase.from("signup_info").insert({
      user_id: userId,
      ip,
      user_agent: s(c.userAgent) ?? ua,
      language: s(c.language),
      languages: s(c.languages),
      timezone: s(c.timezone),
      screen: s(c.screen),
      viewport: s(c.viewport),
      platform: s(c.platform),
      referrer: s(c.referrer),
      url: s(c.url),
      vendor: s(c.vendor),
      device_memory: s(c.deviceMemory),
      hw_concurrency: s(c.hwConcurrency),
      connection: s(c.connection),
      extra: c,
      is_vpn: vpn?.is_vpn ?? null,
      is_proxy: vpn?.is_proxy ?? null,
      vpn_provider: vpn?.vpn_provider ?? null,
      isp: vpn?.isp ?? null,
      country: vpn?.country ?? null,
      region: vpn?.region ?? null,
      city: vpn?.city ?? null,
      vpn_raw: vpn?.vpn_raw ?? null,
      geo_latitude: typeof c.geoLatitude === "number" ? c.geoLatitude : null,
      geo_longitude: typeof c.geoLongitude === "number" ? c.geoLongitude : null,
      geo_accuracy_m: typeof c.geoAccuracyM === "number" ? c.geoAccuracyM : null,
      geo_permission: s(c.geoPermission),
    } as never);
    if (error) throw error;
    return { ok: true, ip, is_vpn: vpn?.is_vpn ?? null, is_proxy: vpn?.is_proxy ?? null };
  });
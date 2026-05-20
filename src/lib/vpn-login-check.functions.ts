import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const InputSchema = z
  .object({
    clientIpHint: z.string().max(80).optional().nullable(),
  })
  .default({});

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.split(",")[0]?.trim().replace(/^\[|\]$/g, "") ?? "";
  const ip = raw.includes(":") ? raw.toLowerCase() : raw.replace(/:\d+$/, "");
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? ip : null;
  }
  if (/^[0-9a-f:]+$/i.test(ip) && ip.includes(":")) return ip;
  return null;
}

function isPrivateIp(ip: string): boolean {
  if (!ip || ip === "unknown") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("169.254.")) return true;
  const cgnat = ip.match(/^100\.(\d+)\./);
  if (cgnat && Number(cgnat[1]) >= 64 && Number(cgnat[1]) <= 127) return true;
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd"))
    return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

function firstPublicIp(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    const ip = normalizeIp(value);
    if (ip && !isPrivateIp(ip)) return ip;
  }
  return normalizeIp(values.find(Boolean)) ?? "unknown";
}

async function checkVpnWithIpapi(ip: string) {
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
    const company = (entry.company ?? {}) as Record<string, unknown>;
    const location = (entry.location ?? {}) as Record<string, unknown>;
    const isVpn = entry.is_vpn === true || vpn.is_vpn === true;
    const isProxy = entry.is_proxy === true || isVpn;
    return {
      is_proxy: isProxy,
      is_vpn: isVpn,
      vpn_provider: (vpn.service as string) ?? null,
      isp: (company.name as string) ?? null,
      country: (location.country as string) ?? null,
      region: (location.state as string) ?? null,
      city: (location.city as string) ?? null,
      vpn_raw: entry,
    };
  } catch {
    return null;
  }
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
    const directEntry = json[ip] as Record<string, unknown> | undefined;
    const fallbackEntry = Object.values(json).find(
      (value): value is Record<string, unknown> =>
        value != null && typeof value === "object" && "proxy" in value,
    );
    const entry = directEntry ?? fallbackEntry ?? {};
    const operator = (entry.operator ?? {}) as Record<string, unknown>;
    const proxy = String(entry.proxy ?? "no").toLowerCase() === "yes";
    const type = String(entry.type ?? "").toLowerCase();
    const providerText = [operator.name, entry.provider, entry.organisation, entry.isp, entry.hostname]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const result = {
      is_proxy: proxy,
      is_vpn: proxy && (type === "vpn" || providerText.includes("vpn")),
      vpn_provider:
        (operator.name as string) ??
        (entry.provider as string) ??
        (entry.organisation as string) ??
        null,
      isp: (entry.isp as string) ?? (entry.provider as string) ?? null,
      country: (entry.country as string) ?? null,
      region: (entry.region as string) ?? null,
      city: (entry.city as string) ?? null,
      vpn_raw: entry,
    };
    if (result.is_vpn || result.is_proxy) return result;
    return (await checkVpnWithIpapi(ip)) ?? result;
  } catch {
    return checkVpnWithIpapi(ip);
  }
}

export const checkMyVpnOnLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const observedIp = firstPublicIp(
      getRequestHeader("cf-connecting-ip"),
      getRequestHeader("x-real-ip"),
      getRequestHeader("x-forwarded-for"),
      getRequestIP({ xForwardedFor: true }),
    );
    const clientIp = normalizeIp(data.clientIpHint);
    const ip = clientIp && !isPrivateIp(clientIp) ? clientIp : observedIp;

    const vpn = isPrivateIp(ip) ? null : await checkVpn(ip);

    // Always write the login trail even if external VPN/IP enrichment is down.
    const { error: historyError } = await supabase.rpc("insert_my_location_event" as never, {
      _event_type: "login",
      _ip: ip,
      _country: vpn?.country ?? null,
      _region: vpn?.region ?? null,
      _city: vpn?.city ?? null,
      _latitude: null,
      _longitude: null,
      _isp: vpn?.isp ?? null,
      _is_vpn: vpn?.is_vpn ?? null,
      _is_proxy: vpn?.is_proxy ?? null,
      _vpn_provider: vpn?.vpn_provider ?? null,
      _user_agent: getRequestHeader("user-agent") ?? null,
      _accuracy_m: null,
    } as never);
    if (historyError) throw new Error(historyError.message);

    if (!vpn) return { ok: true, ip, observedIp, clientIp, skipped: isPrivateIp(ip), is_vpn: null, is_proxy: null };

    const { error } = await supabase.rpc(
      "upsert_my_signup_vpn" as never,
      {
        _ip: ip,
        _is_vpn: vpn.is_vpn,
        _is_proxy: vpn.is_proxy,
        _vpn_provider: vpn.vpn_provider,
        _isp: vpn.isp,
        _country: vpn.country,
        _region: vpn.region,
        _city: vpn.city,
        _vpn_raw: vpn.vpn_raw,
      } as never,
    );
    if (error) throw error;

    return { ok: true, ip, observedIp, clientIp, is_vpn: vpn.is_vpn, is_proxy: vpn.is_proxy };
  });

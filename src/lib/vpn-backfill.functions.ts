import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

interface PcEntry {
  proxy?: string;
  type?: string;
  provider?: string;
  organisation?: string;
  isp?: string;
  country?: string;
  region?: string;
  city?: string;
}

async function proxycheckBatch(ips: string[]): Promise<Record<string, PcEntry>> {
  if (ips.length === 0) return {};
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(
      `https://proxycheck.io/v2/${ips.map(encodeURIComponent).join(",")}?vpn=1&asn=1`,
      { signal: ctrl.signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return {};
    const json = (await res.json()) as Record<string, unknown>;
    const out: Record<string, PcEntry> = {};
    for (const ip of ips) {
      const e = json[ip];
      if (e && typeof e === "object") out[ip] = e as PcEntry;
    }
    return out;
  } catch {
    return {};
  } finally {
    clearTimeout(t);
  }
}

function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "unknown") return true;
  if (ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  if (ip.startsWith("::1") || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  // 172.16.0.0 – 172.31.255.255
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

export const backfillVpnDetection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;

    const { data: rows, error } = await supabase.rpc(
      "admin_list_user_ips_for_vpn_backfill" as never,
    );
    if (error) throw new Error(error.message);
    const list = (rows as Array<{ user_id: string; ip: string }> | null) ?? [];

    // Group unique IPs (skip private/local)
    const cleaned = list.filter((r) => r.ip && !isPrivateIp(r.ip));
    const uniqueIps = Array.from(new Set(cleaned.map((r) => r.ip)));

    // proxycheck.io free tier accepts up to ~100 IPs per request
    const chunks: string[][] = [];
    for (let i = 0; i < uniqueIps.length; i += 50) chunks.push(uniqueIps.slice(i, i + 50));

    const lookup: Record<string, PcEntry> = {};
    for (const chunk of chunks) {
      const result = await proxycheckBatch(chunk);
      Object.assign(lookup, result);
      // small delay between chunks to be polite
      await new Promise((r) => setTimeout(r, 250));
    }

    let updated = 0;
    let flagged = 0;
    for (const row of cleaned) {
      const entry = lookup[row.ip];
      if (!entry) continue;
      const proxy = String(entry.proxy ?? "no").toLowerCase() === "yes";
      const type = String(entry.type ?? "").toLowerCase();
      const is_vpn = proxy && type === "vpn";
      const is_proxy = proxy;
      const { error: upErr } = await supabase.rpc("admin_upsert_signup_vpn" as never, {
        _user_id: row.user_id,
        _ip: row.ip,
        _is_vpn: is_vpn,
        _is_proxy: is_proxy,
        _vpn_provider: entry.provider ?? entry.organisation ?? null,
        _isp: entry.isp ?? null,
        _country: entry.country ?? null,
        _region: entry.region ?? null,
        _city: entry.city ?? null,
        _vpn_raw: entry as unknown as Record<string, unknown>,
      } as never);
      if (upErr) continue;
      updated += 1;
      if (is_vpn || is_proxy) flagged += 1;
    }

    return { scanned: cleaned.length, uniqueIps: uniqueIps.length, updated, flagged };
  });
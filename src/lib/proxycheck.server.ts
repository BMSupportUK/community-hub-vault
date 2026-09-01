/**
 * Shared proxycheck.io access layer.
 *
 * A paid PROXYCHECK_API_KEY unlocks residential/business proxy detection,
 * compromised-server flags and much higher query limits. Without a key we fall
 * back to the anonymous free tier so nothing breaks if the secret is removed.
 *
 * IMPORTANT: read process.env inside functions (server runtime injects at call time).
 */

export function getProxycheckKey(): string | null {
  const key = process.env["PROXYCHECK_API_KEY"];
  return key && key.trim().length > 0 ? key.trim() : null;
}

/** Build a proxycheck v2 URL for one or many IPs, including the key when configured. */
export function proxycheckUrl(ips: string | string[]): string {
  const list = Array.isArray(ips) ? ips : [ips];
  const path = list.map(encodeURIComponent).join(",");
  const key = getProxycheckKey();
  const params = new URLSearchParams({ vpn: "1", asn: "1", risk: "1" });
  if (key) {
    // Paid-key-only enrichment: node/operator detail + full inference set.
    params.set("node", "1");
    params.set("port", "1");
    params.set("seen", "1");
    params.set("days", "30");
    params.set("key", key);
  }
  return `https://proxycheck.io/v2/${path}?${params.toString()}`;
}

/** Max IPs per batch request — paid keys accept far larger batches. */
export function proxycheckBatchSize(): number {
  return getProxycheckKey() ? 100 : 50;
}

export type ProxycheckEntry = Record<string, unknown>;

/** Pull the entry for an IP out of a proxycheck response body. */
export function pickProxycheckEntry(
  json: Record<string, unknown>,
  ip: string,
): ProxycheckEntry | null {
  const direct = json[ip];
  if (direct && typeof direct === "object") return direct as ProxycheckEntry;
  const fallback = Object.values(json).find(
    (value): value is ProxycheckEntry =>
      value != null && typeof value === "object" && "proxy" in (value as object),
  );
  return fallback ?? null;
}

const VPN_TYPE_HINTS = [
  "vpn",
  "residential",
  "business",
  "tor",
  "compromised",
  "hosting",
  "openvpn",
  "wireguard",
  "socks",
  "proxy",
];

/**
 * Any positive flag counts. Covers proxy=yes for every type proxycheck reports
 * (VPN, residential proxy, business proxy, TOR, compromised server, hosting)
 * plus its risk score when a paid key returns one.
 */
export function proxycheckVerdict(entry: ProxycheckEntry | null): {
  is_proxy: boolean;
  is_vpn: boolean;
} | null {
  if (!entry || !("proxy" in entry)) return null;
  const proxy = String(entry.proxy ?? "no").toLowerCase() === "yes";
  const type = String(entry.type ?? "").toLowerCase();
  const operator = (entry.operator ?? {}) as Record<string, unknown>;
  const providerText = [operator.name, entry.provider, entry.organisation, entry.isp, entry.hostname]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const riskRaw = entry.risk;
  const risk = typeof riskRaw === "number" ? riskRaw : Number(riskRaw ?? NaN);
  const riskFlag = Number.isFinite(risk) && risk >= 66;
  const typeFlag = VPN_TYPE_HINTS.some((hint) => type.includes(hint));
  const is_proxy = proxy || typeFlag || riskFlag;
  const is_vpn =
    is_proxy &&
    (typeFlag ||
      providerText.includes("vpn") ||
      providerText.includes("proxy") ||
      String(entry.tor ?? "").toLowerCase() === "yes");
  return { is_proxy, is_vpn };
}

/** Single-IP lookup returning the raw entry, or null when unavailable. */
export async function fetchProxycheckEntry(
  ip: string,
  timeoutMs = 3500,
): Promise<ProxycheckEntry | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(proxycheckUrl(ip), {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    if (String(json.status ?? "").toLowerCase() === "denied") return null;
    return pickProxycheckEntry(json, ip);
  } catch {
    return null;
  }
}

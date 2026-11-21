/**
 * Decide whether a URL may be fetched by the server on a visitor's behalf.
 * Only plain http(s) on the default ports to public host names / public IPs.
 */
export function isSafePublicUrl(raw: string | URL): boolean {
  let u: URL;
  try { u = typeof raw === "string" ? new URL(raw) : raw; } catch { return false; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "80" && u.port !== "443") return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) return false;
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (/\.(local|internal|lan|home|intranet|corp|localdomain|arpa)$/.test(host)) return false;
  if (host.includes(":")) return isPublicIpv6(host);
  if (/^[\d.]+$/.test(host) || /^0x/i.test(host)) return isPublicIpv4(host);
  if (!host.includes(".")) return false; // single-label names resolve internally
  return true;
}

function isPublicIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return false;
  const [a, b] = parts.map(Number) as [number, number, number, number];
  if (parts.map(Number).some((n) => n > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 192 && b === 0) return false;
  return true;
}

function isPublicIpv6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::" || h === "::1") return false;
  const mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPublicIpv4(mapped[1]!);
  if (h.startsWith("::ffff:")) return false;
  if (/^f[cd]/.test(h) || /^fe[89ab]/.test(h) || h.startsWith("ff")) return false;
  return true;
}

/** Fetch following at most `maxHops` redirects, re-checking every hop. */
export async function fetchPublicUrl(url: URL, init: RequestInit, maxHops = 4): Promise<Response | null> {
  let current = url;
  for (let i = 0; i <= maxHops; i++) {
    if (!isSafePublicUrl(current)) return null;
    const res = await fetch(current.toString(), { ...init, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      try { current = new URL(loc, current); } catch { return null; }
      continue;
    }
    return res;
  }
  return null;
}

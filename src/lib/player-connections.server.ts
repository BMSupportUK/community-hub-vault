import type { SupabaseClient } from "@supabase/supabase-js";
import { pickConnections } from "@/lib/player-connections";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any>;

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { n: number | null; at: number }>();

/** Ask the provider itself (DNS + saved login) how many connections this login has. */
async function providerConnections(admin: Admin, login: string): Promise<number | null> {
  const key = login.trim().toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.n;
  let n: number | null = null;
  try {
    const [{ data: ps }, { data: password }] = await Promise.all([
      admin.from("player_settings").select("dns").eq("id", 1).maybeSingle(),
      admin.rpc("player_login_provider_password", { p_login: login }),
    ]);
    const { normaliseDns } = await import("@/lib/player-link");
    const dns = normaliseDns(ps?.dns ?? "");
    if (dns && typeof password === "string" && password) {
      const r = await fetch(`${dns}/player_api.php?username=${encodeURIComponent(login)}&password=${encodeURIComponent(password)}`, { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const { realConnections } = await import("@/lib/player-connections");
        n = realConnections((await r.json())?.user_info?.max_connections);
      }
    }
  } catch { /* provider unreachable: fall back to the package */ }
  // Only remember real answers, so a provider hiccup is retried next time.
  if (n != null) cache.set(key, { n, at: Date.now() });
  return n;
}

/** Connections for a login: provider's number first, then the website package (Single 1, Multi 2, Triple 3). */
export async function loginConnections(admin: Admin, login: string, appReported?: number | null): Promise<number | null> {
  const [provider, { data: pkg }] = await Promise.all([
    providerConnections(admin, login),
    admin.rpc("player_login_connections", { p_login: login }),
  ]);
  return pickConnections(provider, (pkg as number | null) ?? null, appReported ?? null);
}

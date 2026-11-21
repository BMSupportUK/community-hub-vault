/**
 * Public download codes are typed on a TV remote, so they stay short. To stop
 * guessing, each network address gets a limited number of wrong codes per hour.
 */
export const WRONG_CODE_LIMIT = 20;

type Db = { from: (t: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any };

export async function tooManyWrongCodes(db: Db, scope: string, ip: string | null): Promise<boolean> {
  const key = `dl-miss:${scope}:${ip ?? "unknown"}`;
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data } = await db.from("manual_credential_throttles").select("hits").eq("key", key).gt("window_start", since).maybeSingle();
  return Number(data?.hits ?? 0) >= WRONG_CODE_LIMIT;
}

export async function recordWrongCode(db: Db, scope: string, ip: string | null): Promise<void> {
  try { await db.rpc("manual_credentials_throttle", { p_key: `dl-miss:${scope}:${ip ?? "unknown"}`, p_limit: WRONG_CODE_LIMIT }); } catch { /* never block on logging */ }
}

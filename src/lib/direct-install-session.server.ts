import { DIRECT_LINK_TTL_MS, DIRECT_PROGRESS_TTL_MS, directInstallUrl, makeDirectCode } from "./direct-install";
import { sha256Hex } from "./enabler-handoff";

/** Both setup paths create a fresh progress row; only Downloader receives a download capability. */
export async function beginDirectInstallSession(db: any, userId: string, download: boolean, now = Date.now()) {
  const expiresAt = new Date(now + DIRECT_LINK_TTL_MS).toISOString();
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = download ? makeDirectCode() : null;
    const code_hash = code ? await sha256Hex(code) : `session:${crypto.randomUUID()}`;
    const { data, error } = await db.from("direct_install_links")
      .insert({ user_id: userId, code_hash, expires_at: expiresAt })
      .select("id").single();
    if (!error && data?.id) return {
      sessionId: String(data.id),
      ...(code ? { code, url: directInstallUrl(code), expiresAt } : {}),
    };
    if (error?.code !== "23505") break;
  }
  throw new Error("Couldn't start Direct Install. Please try again.");
}

/** Never fall back to another run's progress, even if this run has expired or was reset. */
export async function readDirectInstallSession(db: any, userId: string, sessionId: string | null, now = Date.now()) {
  if (!sessionId) return null;
  const { data, error } = await db.from("direct_install_links")
    .select("id, created_at, downloaded_at, signed_in_at, permission_at, code_at, completed_at")
    .eq("user_id", userId).eq("id", sessionId)
    .gt("created_at", new Date(now - DIRECT_PROGRESS_TTL_MS).toISOString()).maybeSingle();
  if (error) throw new Error("Couldn't check Direct Install progress. Please try again.");
  return data ?? null;
}
/** Backup check used only when the captcha is blocked from loading. */
export const BACKUP_PREFIX = "backup:";
export const BACKUP_MIN_MS = 4000; // humans take longer than this to fill a form
export const BACKUP_MAX_PER_HOUR = 5; // per connection

export function backupToken(startedAt: number): string {
  return `${BACKUP_PREFIX}${startedAt}`;
}

export function judgeBackup(token: string, now: number, recentFromThisConnection: number): { ok: boolean; reason?: string } {
  const started = Number(token.slice(BACKUP_PREFIX.length));
  if (!Number.isFinite(started) || started <= 0) return { ok: false, reason: "bad-token" };
  if (now - started < BACKUP_MIN_MS) return { ok: false, reason: "too-fast" };
  if (now - started > 2 * 60 * 60 * 1000) return { ok: false, reason: "expired" };
  if (recentFromThisConnection >= BACKUP_MAX_PER_HOUR) return { ok: false, reason: "rate-limited" };
  return { ok: true };
}

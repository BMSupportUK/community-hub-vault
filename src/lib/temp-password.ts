/** Readable temporary password: no look-alike characters (0/O, 1/l/I). */
const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

export function generateTempPassword(length = 12, rand: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n))): string {
  const bytes = rand(length);
  let out = "";
  for (let i = 0; i < length; i++) out += CHARS[bytes[i] % CHARS.length];
  return out;
}

/** Only these roles may send a user a new password. */
export const TEMP_PASSWORD_ROLES = ["admin", "management"] as const;
export function canSendTempPassword(roles: string[]): boolean {
  return roles.some((r) => (TEMP_PASSWORD_ROLES as readonly string[]).includes(r));
}

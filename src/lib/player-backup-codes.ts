/** BM Player 2FA backup codes: 10 one-use 8-digit codes, shown as 1234-5678. Digits only so a TV remote number pad can type them. */
export const BACKUP_CODE_COUNT = 10;

export function newBackupCodes(count = BACKUP_CODE_COUNT): string[] {
  const out = new Set<string>();
  while (out.size < count) {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    const n = String(b[0] % 100_000_000).padStart(8, "0");
    out.add(`${n.slice(0, 4)}-${n.slice(4)}`);
  }
  return [...out];
}

/** "1234 5678", "12345678" and "1234-5678" all become "12345678"; anything else is null. */
export function normalizeBackupCode(input: string): string | null {
  const d = input.replace(/[\s-]/g, "");
  return /^\d{8}$/.test(d) ? d : null;
}

type Admin = any;
type Key = { owner_id: string } | { offsite_customer_id: string };
const col = (k: Key) => ("owner_id" in k ? "owner_id" : "offsite_customer_id");
const val = (k: Key) => ("owner_id" in k ? k.owner_id : k.offsite_customer_id);

/** Replace every code for this account with a fresh set of 10. */
export async function issueBackupCodes(admin: Admin, key: Key): Promise<string[]> {
  const codes = newBackupCodes();
  await admin.from("player_backup_codes").delete().eq(col(key), val(key));
  await admin.from("player_backup_codes").insert(codes.map((code) => ({ ...key, code })));
  return codes;
}

/** Spend one unused backup code. True only if it matched and was marked used now. */
export async function useBackupCode(admin: Admin, key: Key, input: string): Promise<boolean> {
  const n = normalizeBackupCode(input);
  if (!n) return false;
  const code = `${n.slice(0, 4)}-${n.slice(4)}`;
  const { data } = await admin.from("player_backup_codes").update({ used_at: new Date().toISOString() })
    .eq(col(key), val(key)).eq("code", code).is("used_at", null).select("id");
  return Array.isArray(data) && data.length > 0;
}

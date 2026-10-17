import { expect, test } from "bun:test";
import { backupToken, judgeBackup } from "../src/lib/captcha-backup";

test("blocked captcha falls back to a backup check that lets a normal visitor through", () => {
  expect(judgeBackup(backupToken(1000), 1000 + 20000, 0).ok).toBe(true);
});
test("backup check rejects forms filled in under 4 seconds", () => {
  expect(judgeBackup(backupToken(1000), 1000 + 3000, 0)).toEqual({ ok: false, reason: "too-fast" });
});
test("backup check allows at most 5 passes per connection per hour", () => {
  expect(judgeBackup(backupToken(1000), 30000, 4).ok).toBe(true);
  expect(judgeBackup(backupToken(1000), 30000, 5)).toEqual({ ok: false, reason: "rate-limited" });
});

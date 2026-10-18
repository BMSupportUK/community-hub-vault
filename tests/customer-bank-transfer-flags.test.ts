import { describe, expect, it } from "bun:test";
import { bankTransferUserIds } from "../src/lib/customer-bank-transfer-flags";

const JANE = "11111111-1111-1111-1111-111111111111";
const TOM = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-10-18T12:00:00Z").getTime();

describe("customer bank transfer £ sign", () => {
  it("marks a customer with bank transfer access and no expiry", () => {
    expect(bankTransferUserIds([{ user_id: JANE, expires_at: null, revoked_at: null }], NOW)).toEqual([JANE]);
  });

  it("marks a customer whose permission has not run out yet", () => {
    expect(
      bankTransferUserIds([{ user_id: JANE, expires_at: "2026-12-31T00:00:00Z", revoked_at: null }], NOW),
    ).toEqual([JANE]);
  });

  it("never marks a customer whose permission expired", () => {
    expect(
      bankTransferUserIds([{ user_id: JANE, expires_at: "2026-01-01T00:00:00Z", revoked_at: null }], NOW),
    ).toEqual([]);
  });

  it("never marks a customer whose permission was revoked", () => {
    expect(
      bankTransferUserIds([{ user_id: JANE, expires_at: null, revoked_at: "2026-09-01T00:00:00Z" }], NOW),
    ).toEqual([]);
  });

  it("marks each customer once and ignores rows with no customer", () => {
    expect(
      bankTransferUserIds(
        [
          { user_id: JANE, expires_at: null, revoked_at: null },
          { user_id: JANE, expires_at: "2026-12-31T00:00:00Z", revoked_at: null },
          { user_id: TOM, expires_at: null, revoked_at: "2026-09-01T00:00:00Z" },
          { user_id: null, expires_at: null, revoked_at: null },
        ],
        NOW,
      ),
    ).toEqual([JANE]);
  });

  it("returns nothing when nobody has bank transfer access", () => {
    expect(bankTransferUserIds(null, NOW)).toEqual([]);
    expect(bankTransferUserIds([], NOW)).toEqual([]);
  });
});

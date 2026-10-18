import { describe, expect, it } from "bun:test";
import { discountFlagUserIds } from "../src/lib/customer-discount-flags";

const JANE = "11111111-1111-1111-1111-111111111111";
const TOM = "22222222-2222-2222-2222-222222222222";

describe("customer discount code tick", () => {
  it("ticks a customer who has an active code", () => {
    expect(discountFlagUserIds([{ user_id: JANE, is_active: true }])).toEqual([JANE]);
  });

  it("never ticks a customer whose only code was revoked", () => {
    expect(discountFlagUserIds([{ user_id: JANE, is_active: false }])).toEqual([]);
  });

  it("never ticks anyone for a code that is for everyone", () => {
    expect(discountFlagUserIds([{ user_id: null, is_active: true }])).toEqual([]);
  });

  it("ticks each customer once however many codes they hold", () => {
    expect(
      discountFlagUserIds([
        { user_id: JANE, is_active: true },
        { user_id: JANE, is_active: true },
        { user_id: TOM, is_active: true },
        { user_id: TOM, is_active: false },
      ]),
    ).toEqual([JANE, TOM]);
  });

  it("returns nothing when there are no codes at all", () => {
    expect(discountFlagUserIds(null)).toEqual([]);
    expect(discountFlagUserIds([])).toEqual([]);
  });
});

import { describe, expect, it } from "bun:test";
import {
  discountCodeCents,
  discountCodeLabel,
  pickCustomerDiscountCodes,
} from "../src/lib/manual-order-discount";

const JANE = "11111111-1111-1111-1111-111111111111";
const TOM = "22222222-2222-2222-2222-222222222222";

describe("manual order discount code", () => {
  it("keeps one code per customer, the newest first", () => {
    const picked = pickCustomerDiscountCodes([
      { user_id: JANE, code: "NEW-1", percent: null, amount_cents: 500 },
      { user_id: JANE, code: "OLD-2", percent: null, amount_cents: 900 },
      { user_id: TOM, code: "TOM-1", percent: 10, amount_cents: null },
    ]);
    expect(picked[JANE]?.code).toBe("NEW-1");
    expect(picked[TOM]?.code).toBe("TOM-1");
  });

  it("ignores codes that belong to everyone", () => {
    expect(pickCustomerDiscountCodes([{ user_id: null, code: "ALL-1" }])).toEqual({});
  });

  it("takes the cash amount off the order", () => {
    const code = { userId: JANE, code: "NEW-1", percent: null, amount_cents: 500 };
    expect(discountCodeCents(code, 6000)).toBe(500);
  });

  it("never takes off more than the order is worth", () => {
    const code = { userId: JANE, code: "NEW-1", percent: null, amount_cents: 500 };
    expect(discountCodeCents(code, 300)).toBe(300);
  });

  it("takes the percentage off the order", () => {
    const code = { userId: JANE, code: "NEW-1", percent: 10, amount_cents: null };
    expect(discountCodeCents(code, 6000)).toBe(600);
  });

  it("takes nothing off when the customer has no code", () => {
    expect(discountCodeCents(null, 6000)).toBe(0);
  });

  it("describes the code to the admin", () => {
    expect(discountCodeLabel({ userId: JANE, code: "NEW-1", percent: null, amount_cents: 500 })).toBe("£5.00 off");
    expect(discountCodeLabel({ userId: JANE, code: "NEW-1", percent: 10, amount_cents: null })).toBe("10% off");
  });
});

import { eligibleSubtotalCents as eligible } from "../src/lib/manual-order-discount";
import { test as t2, expect as e2 } from "bun:test";
const lines = [
  { productId: "12m", priceCents: 6000, quantity: 1 },
  { productId: "1m", priceCents: 1000, quantity: 1 },
];
t2("code limited to the 12 month package ignores other packages", () => {
  e2(eligible(lines, ["12m"])).toBe(6000);
});
t2("code limited to a package not in the order takes nothing off", () => {
  e2(eligible([lines[1]], ["12m"])).toBe(0);
});
t2("code with no packages listed covers every package", () => {
  e2(eligible(lines, [])).toBe(7000);
});

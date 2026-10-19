import { describe, expect, it } from "bun:test";
import { goCardlessFeeFromPayoutItems, isGoCardlessPaid, pickGoCardlessEnv, resolvePayByBankProvider } from "@/lib/gocardless";
import { profitPaymentGroup } from "@/lib/profit-payment-groups";

describe("GoCardless Pay by bank (on hold until switched on)", () => {
  it("stays on Stripe unless GoCardless is chosen and set up", () => {
    expect(resolvePayByBankProvider(null, true)).toBe("stripe");
    expect(resolvePayByBankProvider({ provider: "gocardless" }, false)).toBe("stripe");
    expect(resolvePayByBankProvider({ provider: "gocardless" }, true)).toBe("gocardless");
  });
  it("uses the live token before the test token", () => {
    expect(pickGoCardlessEnv(true, true)).toBe("live");
    expect(pickGoCardlessEnv(false, true)).toBe("sandbox");
    expect(pickGoCardlessEnv(false, false)).toBeNull();
  });
  it("only treats confirmed or paid-out payments as paid", () => {
    expect(isGoCardlessPaid("confirmed")).toBe(true);
    expect(isGoCardlessPaid("paid_out")).toBe(true);
    expect(isGoCardlessPaid("pending_submission")).toBe(false);
  });
  it("counts GoCardless payments in the Open Banking profit group", () => {
    expect(profitPaymentGroup("gocardless")).toBe("open_banking");
  });
  it("takes the fee for that payment only", () => {
    const items = [
      { type: "payment_paid_out", amount: "60.00", links: { payment: "PM1" } },
      { type: "gocardless_fee", amount: "-0.40", links: { payment: "PM1" } },
      { type: "gocardless_fee", amount: "-0.90", links: { payment: "PM2" } },
    ];
    expect(goCardlessFeeFromPayoutItems(items, "PM1")).toBe(40);
  });
});

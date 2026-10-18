import { describe, expect, it } from "bun:test";
import { PAY_BY_BANK_BANKS, PAY_BY_BANK_INTRO, PAY_BY_BANK_NOTE } from "@/lib/pay-by-bank";

// Dane's rule: customers must see which banks Pay by Bank supports, and a
// note telling them to use the card invoice when their bank isn't supported.
describe("Pay by Bank customer information", () => {
  it("offers the card invoice as the fallback when a bank isn't supported", () => {
    expect(PAY_BY_BANK_NOTE).toContain("card invoice");
  });

  it("lists real UK banks so customers know what is supported", () => {
    expect(PAY_BY_BANK_BANKS.length).toBeGreaterThanOrEqual(10);
    for (const bank of ["HSBC", "Lloyds Bank", "NatWest", "Nationwide", "Santander", "Monzo", "Starling Bank"]) {
      expect(PAY_BY_BANK_BANKS).toContain(bank);
    }
    expect(PAY_BY_BANK_INTRO.toLowerCase()).toContain("uk bank");
  });
});

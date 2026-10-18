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
    for (const bank of ["HSBC", "Lloyds Bank", "NatWest", "Nationwide", "Santander", "Monzo", "Barclays"]) {
      expect(PAY_BY_BANK_BANKS).toContain(bank);
    }
    expect(PAY_BY_BANK_INTRO.toLowerCase()).toContain("uk bank");
  });
});

import { htmlToLines, parseSupportedBanks } from "@/lib/pay-by-bank";

describe("Pay by Bank list auto-update", () => {
  const page = "<p>Supported banks cover 98% of the UK consumer market:</p><ul><li>Barclays</li><li>Bank of Scotland</li><li>Danske Bank</li><li>First Direct</li><li>Halifax</li><li>HSBC</li><li>Lloyds</li><li>Natwest</li><li>Nationwide</li><li>Monzo</li><li>Starling</li></ul><h3>Can I set up recurring payments?</h3>";
  it("picks up a newly added bank (Starling) and normalises names", () => {
    const banks = parseSupportedBanks(htmlToLines(page))!;
    expect(banks).toContain("Starling Bank");
    expect(banks).toContain("Barclays");
    expect(banks).toContain("Lloyds Bank");
    expect(banks).toContain("NatWest");
    expect(banks).not.toContain("Can I set up recurring payments?");
  });
  it("keeps the existing list when the page layout breaks", () => {
    expect(parseSupportedBanks("<p>Page moved</p>")).toBeNull();
  });
});

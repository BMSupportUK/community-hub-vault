import { describe, expect, it } from "bun:test";
import { bankOptionDisabled, nextPayChoice, readStoredPayChoice, storePayChoice } from "@/lib/pay-choice-lock";

// Dane's rule: choosing to pay by card must grey out Pay by bank — a customer
// can't pay the same order both ways.
describe("card choice locks off pay by bank", () => {
  it("greys out Pay by bank once the card invoice is chosen", () => {
    expect(bankOptionDisabled("card")).toBe(true);
    expect(bankOptionDisabled("bank")).toBe(false);
  });

  it("keeps the card choice when Pay by bank is clicked afterwards", () => {
    expect(nextPayChoice("bank", "card")).toBe("card");
    expect(nextPayChoice("card", "bank")).toBe("card");
    expect(nextPayChoice("bank", "bank")).toBe("bank");
  });

  it("remembers the card choice after a refresh, for that order only", () => {
    const store = new Map<string, string>();
    const had = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", {
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
      },
      configurable: true,
      writable: true,
    });
    try {
      storePayChoice("ABC123", "card");
      expect(readStoredPayChoice("ABC123")).toBe("card");
      expect(readStoredPayChoice("XYZ789")).toBeNull();
    } finally {
      if (had) Object.defineProperty(globalThis, "sessionStorage", { ...had, configurable: true, writable: true });
      else delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
    }
  });
});

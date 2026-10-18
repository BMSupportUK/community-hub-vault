import { describe, expect, it } from "bun:test";
import {
  customerLabelWithManualEmail,
  manualCustomerEmail,
} from "../src/lib/manual-customer-label";

const emails = {
  "11111111-1111-1111-1111-111111111111": "newcomer@example.com",
  "22222222-2222-2222-2222-222222222222": "   ",
};

describe("manually added customer emails", () => {
  it("shows the email next to a manually added customer's username", () => {
    expect(
      customerLabelWithManualEmail(
        { id: "11111111-1111-1111-1111-111111111111", username: "newcomer" },
        emails,
      ),
    ).toBe("newcomer · newcomer@example.com");
  });

  it("never shows an email for a customer who was not added by hand", () => {
    expect(
      customerLabelWithManualEmail({ id: "33333333-3333-3333-3333-333333333333", username: "andylewis" }, emails),
    ).toBe("andylewis");
    expect(manualCustomerEmail({ id: "33333333-3333-3333-3333-333333333333" }, emails)).toBeNull();
  });

  it("falls back to the plain username when the manual email is missing or blank", () => {
    expect(
      customerLabelWithManualEmail({ id: "22222222-2222-2222-2222-222222222222", display_name: "Sam" }, emails),
    ).toBe("Sam");
    expect(manualCustomerEmail({ id: "44444444-4444-4444-4444-444444444444" }, emails)).toBeNull();
    expect(manualCustomerEmail(null, emails)).toBeNull();
  });

  it("uses the username, then the display name, before the email", () => {
    expect(
      customerLabelWithManualEmail(
        { id: "11111111-1111-1111-1111-111111111111", username: null, display_name: "Newcomer" },
        emails,
      ),
    ).toBe("Newcomer · newcomer@example.com");
  });
});

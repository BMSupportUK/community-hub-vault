import { test, expect } from "bun:test";
import { STRIPE_CHECKOUT_ENABLED, effectiveCardProvider, squareInvoiceChatMessage } from "../src/lib/payment-methods";
test("Stripe is hidden and Stripe orders pay through Square", () => {
  expect(STRIPE_CHECKOUT_ENABLED).toBe(false);
  expect(effectiveCardProvider("stripe")).toBe("square");
  expect(effectiveCardProvider("square")).toBe("square");
  expect(effectiveCardProvider("crypto")).toBe("crypto");
});
test("Square invoice chat message carries amount and link", () => {
  expect(squareInvoiceChatMessage(6500, "https://sq.example/x")).toBe("Here is your Square invoice for £65.00 — tap to pay: https://sq.example/x");
});

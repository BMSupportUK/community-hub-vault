import { expect, test } from "bun:test";
import { isBmSupportPayment } from "../src/lib/wise-relevance";

const awaiting = [{ references: ["ab0c04ca", "BM-AB0C04"], amountCents: 6000 }];

test("matched payment is kept", () => {
  expect(isBmSupportPayment({ reference: "x", amountCents: 100, matched: true }, awaiting)).toBe(true);
});
test("reference containing order ref is kept", () => {
  expect(isBmSupportPayment({ reference: "pay ab0c04ca", amountCents: 100, matched: false }, awaiting)).toBe(true);
});
test("amount-only match is kept", () => {
  expect(isBmSupportPayment({ reference: "", amountCents: 6000, matched: false }, awaiting)).toBe(true);
});
test("unrelated £20 'WISE' payment is hidden", () => {
  expect(isBmSupportPayment({ reference: "WISE", amountCents: 2000, matched: false }, awaiting)).toBe(false);
});

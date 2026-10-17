import { test, expect } from "bun:test";
import { customerDate, customerHasRecordedYear } from "../src/lib/customer-date";

test("customer dates use UK day without hours or minutes", () => {
  expect(customerDate("2026-10-17T23:30:00Z")).toBe("18 Oct 2026");
  expect(customerDate("2026-12-25T09:02:00Z")).toBe("25 Dec 2026");
});

test("missing joining year suppresses dates whether expiry is saved or absent", () => {
  for (const expiresAt of [null, "2027-12-25T09:02:00Z"]) {
    const customer = { firstSubscriptionAt: null, expiresAt };
    expect(customerHasRecordedYear(customer.firstSubscriptionAt)).toBe(false);
    expect(customer.expiresAt).toBe(expiresAt);
  }
});

test("a recorded joining year keeps dates visible including a customer joining this year", () => {
  expect(customerHasRecordedYear(`${new Date().getUTCFullYear()}-01-01`)).toBe(true);
  expect(customerHasRecordedYear("2022-01-01")).toBe(true);
});
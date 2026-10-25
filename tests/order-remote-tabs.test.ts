import { expect, test } from "bun:test";
import { usesCustomerOrderRemoteTabs } from "../src/lib/order-remote-tabs";

test("DEMO-TV1 exposes customer Remote setup to the admin testing it", () => {
  expect(usesCustomerOrderRemoteTabs("1e03aaef13e0572a91a400372950765bde919c2ffba5f03ec4da7b7f5eaa52f9", true)).toBe(true);
});

test("ordinary staff-managed orders retain their existing staff presentation", () => {
  expect(usesCustomerOrderRemoteTabs("ordinary-order", true)).toBe(false);
});

test("ordinary customers keep the same remote setup flow", () => {
  expect(usesCustomerOrderRemoteTabs("ordinary-order", false)).toBe(true);
});
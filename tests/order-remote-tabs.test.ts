import { expect, test } from "bun:test";
import { orderStaffHelpTicket, usesCustomerOrderRemoteTabs } from "../src/lib/order-remote-tabs";

test("DEMO-TV1 exposes customer Remote setup to the admin testing it", () => {
  expect(usesCustomerOrderRemoteTabs("1e03aaef13e0572a91a400372950765bde919c2ffba5f03ec4da7b7f5eaa52f9", true)).toBe(true);
});

test("ordinary staff-managed orders retain their existing staff presentation", () => {
  expect(usesCustomerOrderRemoteTabs("ordinary-order", true)).toBe(false);
});

test("ordinary customers keep the same remote setup flow", () => {
  expect(usesCustomerOrderRemoteTabs("ordinary-order", false)).toBe(true);
});

test("order staff help waits for remote setup before being sent to staff", () => {
  const ticket = orderStaffHelpTicket("customer-1", "general-category", "BM123");
  expect(ticket.remote_support).toBe(true);
  expect(ticket.remote_setup_pending).toBe(true);
  expect(ticket.user_id).toBe("customer-1");
  expect(ticket.category_id).toBe("general-category");
  expect(ticket.subject).toBe("Remote installation help — order BM123");
});
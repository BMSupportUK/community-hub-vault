import { expect, test } from "bun:test";
import { customerOrderDestination, customerOrderNoticeId } from "../src/lib/customer-order-notice";
const id = "3de3a26b-03d5-4f5f-bd2a-e87eded4f9d8";
test("placed customer orders go to the orders section in the Shop", () => {
  expect(customerOrderDestination()).toEqual({ to: "/shop", search: { tab: "orders" } });
});
test("password copy actions belong only to customer order payment notifications", () => {
  expect(customerOrderNoticeId("user", "customer_order_payment", id)).toBe(id);
  expect(customerOrderNoticeId("staff", "customer_order_payment", id)).toBeNull();
  expect(customerOrderNoticeId("user", "order_placed", id)).toBeNull();
  expect(customerOrderNoticeId("user", "customer_order_payment", "invalid")).toBeNull();
});
test('password request notifications offer copy actions only to customers', () => {
  expect(customerOrderNoticeId('user', 'customer_order_password', id)).toBe(id);
  expect(customerOrderNoticeId('staff', 'customer_order_password', id)).toBeNull();
  expect(customerOrderNoticeId('user', 'customer_order_password', 'invalid')).toBeNull();
});
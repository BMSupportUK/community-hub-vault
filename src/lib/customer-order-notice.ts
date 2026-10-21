export const CUSTOMER_ORDER_PAYMENT_KIND = "customer_order_payment";
export const CUSTOMER_ORDER_PASSWORD_KIND = "customer_order_password";

export function customerOrderDestination() {
  return { to: "/shop" as const, search: { tab: "orders" } };
}

export function customerOrderNoticeId(source: string, kind: string, orderId: string | null): string | null {
  if (source !== "user" || ![CUSTOMER_ORDER_PAYMENT_KIND, CUSTOMER_ORDER_PASSWORD_KIND].includes(kind) || !orderId) return null;
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orderId) ? orderId : null;
}
export const CUSTOMER_ORDER_PAYMENT_KIND = "customer_order_payment";

export function customerOrderDestination() {
  return { to: "/shop" as const, search: { tab: "orders" } };
}

export function customerOrderNoticeId(source: string, kind: string, orderId: string | null): string | null {
  if (source !== "user" || kind !== CUSTOMER_ORDER_PAYMENT_KIND || !orderId) return null;
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orderId) ? orderId : null;
}
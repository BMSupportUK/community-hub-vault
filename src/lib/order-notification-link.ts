/** Order alerts link to staff checkout, never the customer's shop order view. */
export function staffOrderNotificationLink(kind: string, orderId: string | null): string | null {
  if (!orderId || !["order_placed", "manual_order"].includes(kind)) return null;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(orderId)) return null;
  return `/admin-secure-page?order=${orderId}`;
}
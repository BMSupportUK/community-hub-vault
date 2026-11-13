export type NamedOrder = {
  user_id?: string | null;
  shipping_name?: string | null;
  existing_username?: string | null;
  customer_type?: string | null;
};

/** Manual orders store their creator in user_id, not their customer's identity. */
export function orderCustomerName(order: NamedOrder, names: Record<string, string>) {
  if (order.customer_type === 'manual') {
    return order.shipping_name || order.existing_username || 'Manual customer';
  }
  return (order.user_id && names[order.user_id]) || order.shipping_name || order.existing_username || '—';
}
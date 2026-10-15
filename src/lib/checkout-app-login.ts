/**
 * A customer may open their own app login details from the secure checkout page
 * only once the order is paid and the team has confirmed account setup — never
 * while payment is outstanding or after a cancellation.
 */
export type CheckoutAppLoginGate = {
  paid: boolean;
  cancelled: boolean;
  accountSetupAt: string | null;
};

export function canViewCheckoutAppLogin(order: CheckoutAppLoginGate): boolean {
  return order.paid && !order.cancelled && !!order.accountSetupAt;
}

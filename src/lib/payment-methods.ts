/** Stripe is hidden from secure checkout for now; flip to true to bring it back. */
export const STRIPE_CHECKOUT_ENABLED = false;

/** While Stripe is hidden, any order still set to Stripe pays through Square. */
export function effectiveCardProvider<T extends string>(method: T): T | 'square' {
  return method === 'stripe' && !STRIPE_CHECKOUT_ENABLED ? 'square' : method;
}

export function squareInvoiceChatMessage(amountCents: number, url: string): string {
  return `Here is your Square invoice for £${(amountCents / 100).toFixed(2)} — tap to pay: ${url}`;
}

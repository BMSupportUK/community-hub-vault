/**
 * Discount codes for manually added orders.
 *
 * When the team pick a manual customer on the Add an order page, the code
 * saved against that customer is applied to the order automatically instead of
 * the admin having to type a discount in by hand.
 */

export type CustomerDiscountCode = {
  userId: string;
  code: string;
  percent: number | null;
  amount_cents: number | null;
  /** Products this code may come off. Empty means every product. */
  productIds: string[];
};

/**
 * The part of the order a code may come off: only the packages the code is
 * allowed for. A code with no packages listed covers every package.
 */
export function eligibleSubtotalCents(
  lines: { productId: string; priceCents: number; quantity: number }[],
  productIds: string[],
): number {
  return lines
    .filter((l) => productIds.length === 0 || productIds.includes(l.productId))
    .reduce((a, l) => a + l.priceCents * l.quantity, 0);
}

/**
 * One code per customer, newest first.
 *
 * Rows arrive newest-first from the database, so the first code seen for a
 * customer is the one they are currently on. Codes with no customer attached
 * (codes for everyone) are ignored — those apply themselves at checkout.
 */
export function pickCustomerDiscountCodes(
  rows: { id?: string; user_id?: string | null; code?: string | null; percent?: number | null; amount_cents?: number | null }[]
    | null
    | undefined,
  links: { discount_code_id: string; product_id: string }[] = [],
): Record<string, CustomerDiscountCode> {
  const byCustomer: Record<string, CustomerDiscountCode> = {};
  for (const row of rows ?? []) {
    if (!row.user_id || !row.code) continue;
    if (byCustomer[row.user_id]) continue;
    byCustomer[row.user_id] = {
      userId: row.user_id,
      code: row.code,
      percent: row.percent ?? null,
      amount_cents: row.amount_cents ?? null,
      productIds: links.filter((l) => l.discount_code_id === row.id).map((l) => l.product_id),
    };
  }
  return byCustomer;
}

/** "£5.00 off" or "10% off" — what the admin sees beside the applied code. */
export function discountCodeLabel(code: CustomerDiscountCode | null): string {
  if (!code) return "";
  if (code.percent != null) return `${code.percent}% off`;
  if (code.amount_cents != null)
    return `£${(code.amount_cents / 100).toFixed(2)} off`;
  return "";
}

/**
 * What the code takes off this order, in pence.
 *
 * A cash code never takes off more than the order is worth, so the total can
 * never go below zero.
 */
export function discountCodeCents(code: CustomerDiscountCode | null, subtotalCents: number): number {
  if (!code) return 0;
  if (code.percent != null) return Math.round((subtotalCents * code.percent) / 100);
  if (code.amount_cents != null) return Math.min(code.amount_cents, Math.max(0, subtotalCents));
  return 0;
}

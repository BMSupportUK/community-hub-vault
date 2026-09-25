/**
 * Shared item-line builder for automated order payment messages.
 *
 * When an order was bought with a discount code the items still carry their
 * full price — the discount lives on the order. Show the full price struck
 * through (combining long-stroke overlay, so it renders in any plain-text
 * chat) followed by the discounted amount, matching what was actually paid.
 */
function strikeThrough(text: string): string {
  return [...text].map((ch) => (ch === " " ? ch : `${ch}\u0336`)).join("");
}

export type OrderItemRow = {
  product_name: string | null;
  quantity: number | null;
  unit_price_cents: number | null;
};

const GBP = (cents: number) => `£${(cents / 100).toFixed(2)}`;

export function buildOrderItemLines(items: OrderItemRow[] | null | undefined, discountCents?: number | null): string[] {
  const rows = items ?? [];
  const subtotal = rows.reduce((s, it) => s + (it.unit_price_cents ?? 0) * (it.quantity ?? 1), 0);
  const discount = Math.max(0, Math.min(discountCents ?? 0, subtotal));
  let assigned = 0;
  return rows.map((it, idx) => {
    const qty = it.quantity ?? 1;
    const lineTotal = (it.unit_price_cents ?? 0) * qty;
    let share = 0;
    if (discount > 0 && subtotal > 0) {
      // Spread the discount proportionally; the last line absorbs rounding.
      share = idx === rows.length - 1 ? discount - assigned : Math.round((discount * lineTotal) / subtotal);
      assigned += share;
    }
    const net = Math.max(0, lineTotal - share);
    const price = discount > 0 ? `${strikeThrough(GBP(lineTotal))} ${GBP(net)}` : GBP(lineTotal);
    return `• ${qty} × ${it.product_name ?? "Item"} — ${price}`;
  });
}

## Goal

When an order is cancelled (by customer or staff, from either the Shop page or the Ticket sidebar), also cancel the linked Square invoice so the customer can no longer pay it.

## Change

There are two cancel sites and one existing server fn that already does the Square work:

- `src/routes/_authenticated/_approved/shop.tsx` → `cancelOrder` (around line 3492)
- `src/routes/_authenticated/_approved/tickets.tsx` → `orderCancel` (around line 979)
- `src/lib/square-invoices.functions.ts` → `cancelSquareInvoice` (already implemented; RLS-checked via `assertAdminOrOrderOwner`)

In both cancel handlers, after the `orders.update({ status: "cancelled" })` succeeds:

1. Check `order_invoices` for a row matching the order id whose `status` is not already `CANCELED`/`PAID`.
2. If one exists, call `cancelSquareInvoice({ data: { orderId } })` via `useServerFn`.
3. On success, post a system message in the order/ticket chat: `🚫 Square invoice cancelled.`
4. On failure, swallow the error and show a non-blocking `toast.warning("Order cancelled, but the Square invoice could not be cancelled automatically.")` — the order cancellation must still stand.

Webhook (`/api/public/hooks/square-invoice`) already updates `order_invoices.status` on `invoice.canceled` events, so the local row will sync naturally; the immediate optimistic-style call above just makes the cancel happen now instead of waiting for the customer to try to pay.

## Out of scope

- Refunds for already-paid orders (Square invoice cancel is not allowed once `PAID`; we skip it).
- Admin-side bulk cancellations (none exist).
- UI changes — only behavioural.

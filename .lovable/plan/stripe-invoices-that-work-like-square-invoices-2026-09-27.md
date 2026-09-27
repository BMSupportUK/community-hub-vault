# Stripe invoices that work like Square invoices

## What this does

Today the Stripe tab in the order payment dialog only offers an inline card
checkout. The Square tab generates a real invoice, posts the pay link into the
order chat (which the support ticket shows), and detects the payment later.
This change gives Stripe the same behaviour: an admin (or the customer) can
generate a Stripe invoice for the order, the link is posted into the order
chat and support ticket, the customer opens it and pays by card, and the
payment is then detected automatically — marking the order paid and posting
the "payment received" notice, exactly like Square.

The existing inline "pay now by card" Stripe checkout stays as well, so
customers who want to pay immediately still can.

## How it works

- **Create the invoice** — a new server function mirrors
  `createSquareInvoiceForOrder`: it finds or creates the Stripe customer,
  adds one invoice item per ordered product (falling back to a single line
  for the order total, same as Square), creates a Stripe invoice with a
  14-day due date and card payments enabled, finalises it so it has a real
  invoice number and a hosted payment page URL, and posts
  `💳 Pay your invoice here: {link}` into the order chat — the identical
  message Square posts. No email is sent from Stripe; the link is shared
  through the ticket, like Square.
- **Store it** — the `order_invoices` table gains a `stripe_invoice_id`
  column (and `square_invoice_id` becomes optional so a row can hold a
  Stripe invoice only). The existing `invoice_number`, `public_url`,
  `status`, `amount_cents` columns are reused.
- **Detect payment** —
  - A new `refreshStripeInvoiceStatus` mirrors the Square refresh: it reads
    the invoice, updates the row, and when Stripe reports it PAID it marks
    the order paid and posts the automated payment-received notice to the
    order and support ticket.
  - The existing "I've paid" check (`order-payment-check`) gains a Stripe
    invoice lookup before the checkout-session lookup, so payment is caught
    either way.
- **Cancellation** — cancelling an order voids a Stripe invoice the same way
  it cancels a Square invoice.

## UI

In `OrderPaymentDialog`, the Stripe tab gets the same shape as the Square
tab: a "Create invoice" button that stores and posts the link, then shows
"Open Stripe invoice" plus a status check button. The inline card checkout
remains beneath it.

## Files

- `src/lib/stripe-invoices.functions.ts` (new) — create / refresh / void
  invoice functions, using `createStripeClient` from the shared Stripe
  utility.
- `src/components/app/OrderPaymentDialog.tsx` — Stripe tab invoice panel.
- `src/lib/order-payment-check.functions.ts` — Stripe branch checks invoice
  status first, then the checkout session.
- `src/lib/square-invoices.functions.ts` (`cancelOrderAndSquareInvoice`) —
  also voids a Stripe invoice if one exists.
- Migration — add `stripe_invoice_id` to `order_invoices`, relax
  `square_invoice_id`.

## Notes

- Amount is always the order total in GBP; a mismatched invoice is refused,
  same as the existing checkout check.
- Only admin, management, or the order owner can create/refresh invoices —
  same rule as Square invoices.

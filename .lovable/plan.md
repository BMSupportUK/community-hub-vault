## Goal

When a Square invoice is created for an order, show each purchased item next to the order reference instead of a single generic `Order #xxxx` line.

## Change

In `src/lib/square-invoices.functions.ts` (`createSquareInvoiceForOrder` handler):

1. After loading the order, also fetch its rows from `order_items` (`product_name`, `quantity`, `unit_price_cents`).
2. Build the Square order `line_items` array from those rows:
   - `name`: `Order #{shortId} — {product_name}` so the order ref stays visible next to the item description
   - `quantity`: `String(quantity)`
   - `base_price_money`: `{ amount: unit_price_cents, currency: "GBP" }`
3. Fallback: if no items are found (legacy orders), keep the existing single `Order #{shortId}` line at `order.total_cents` so invoicing never breaks.
4. Sanity check: sum of `unit_price_cents * quantity` should equal `order.total_cents`. If they differ (e.g. discount applied), append a `Discount` line item with a negative-equivalent adjustment, or fall back to the single-line behaviour, to keep the Square total aligned with `order.total_cents`.

No changes to webhook, refresh, cancel flows, RLS, or the PDF receipt — only the line items sent to Square at invoice creation time.

## Out of scope

- Existing already-published Square invoices (cannot be edited; only new invoices get itemised lines).
- Any UI changes.

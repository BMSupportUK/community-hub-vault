## Goal

Replace the **Square hosted invoice** flow with a **Square Web Payments SDK** card form embedded directly in the order panel. Customer clicks **Pay £X**, enters card details inline, charge captures immediately — no emailed invoice, no Square-hosted page.

## What changes

### 1. Frontend: inline card form (Square Web Payments SDK)
Replace `SquareInvoicePanel` with `SquareCardPanel`:

- Loads `https://web.squarecdn.com/v1/square.js` (or `sandbox.web.squarecdn.com` in sandbox) via dynamic script tag on mount.
- Renders Square's hosted card iframe into a `<div ref>` using `payments.card()` → `card.attach()`.
- **Pay £X** button:
  1. Calls `card.tokenize()` → gets `sourceId` (single-use nonce).
  2. POSTs `{ orderId, sourceId }` to a new server fn `chargeOrderWithSquare`.
  3. On success: toast, refresh order (now shows `paid_at`).
  4. On failure: show error inline, form stays mounted for retry.

Hidden once `order.paid_at` is set — replaced with a green "Paid by card" badge + last-4 + receipt URL.

### 2. Backend: `chargeOrderWithSquare` server fn
New in `src/lib/square-payments.functions.ts`:

- Validates input with Zod (`orderId` uuid, `sourceId` string).
- Loads order, asserts admin or order owner, asserts not already paid.
- Calls Square `POST /v2/payments` with: `source_id`, `idempotency_key` (`order-<id>-<ts>`), `amount_money` (order total + GBP), `location_id`, `reference_id: orderId`, `note: "Order #<short>"`, `autocomplete: true`.
- On `COMPLETED`: updates `orders.paid_at = now()`, writes new `order_payments` row (see below), posts confirmation in order chat.
- Returns `{ status, receiptUrl, cardBrand, last4 }`.

### 3. New table: `order_payments`
Stores the captured charge metadata (replaces invoice ledger semantics):

Fields: `order_id` (unique), `square_payment_id`, `status`, `amount_cents`, `currency`, `card_brand`, `last_4`, `receipt_url`, `created_by`.

RLS: admin/management full; order owner read-only on their own.

### 4. Keep `order_invoices` table for now
Leave the existing table in place but stop writing to it. (Drop in a follow-up if you confirm you've fully migrated. Old paid invoices stay visible in DB for records.)

### 5. Square webhook simplifies
`src/routes/api/public/hooks/square-invoice.ts` is no longer needed for the new flow because we capture synchronously. I'll keep it for any historic invoices still outstanding, but new orders won't depend on it.

### 6. Files removed / changed
- `src/lib/square-invoices.functions.ts` → kept but no longer called from UI (still callable for legacy invoices, or delete on request).
- `src/routes/_authenticated/_approved/shop.tsx` → swap `SquareInvoicePanel` → `SquareCardPanel`; remove invoice imports.

## Out of scope (ask if wanted)

- Apple Pay / Google Pay buttons via Web Payments SDK (easy add later)
- Saving cards on file for repeat customers
- 3DS / SCA challenge UI customisation (Square handles inline by default)
- Refund button in admin

## What you need to do

Nothing new — you already have:
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `SQUARE_ENVIRONMENT`

I'll also expose your Square **Application ID** as a client-readable env var (`VITE_SQUARE_APPLICATION_ID`) — the Web SDK needs it in the browser. It's a public identifier (safe to expose). You'll need to grab it from Square Dashboard → Developer → your app → **Application ID**, and I'll request it as a secret.

## Implementation steps

```text
1. Request VITE_SQUARE_APPLICATION_ID via add_secret
2. Migration: create order_payments table + RLS
3. Add src/lib/square-payments.functions.ts (chargeOrderWithSquare)
4. Add SquareCardPanel component in shop.tsx (Web SDK loader + card.attach + tokenize → server fn)
5. Replace <SquareInvoicePanel /> usage with <SquareCardPanel />
6. Test in sandbox: card 4111 1111 1111 1111 → confirm paid_at set, receipt URL shown
```

**Files touched**
- `supabase/migrations/<new>.sql` (new)
- `src/lib/square-payments.functions.ts` (new)
- `src/routes/_authenticated/_approved/shop.tsx` (swap panel)

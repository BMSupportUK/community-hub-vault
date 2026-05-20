## Goal

Add PayPal as a second checkout option in the order payment panel, sitting next to the existing Square card flow (same `SquareCardPanel` area in `src/routes/_authenticated/_approved/shop.tsx`). Customer can choose either Square (card / Google Pay) **or** PayPal to pay the order.

## What the user will see

In the sales chat order panel, when an unpaid order is selected:

```text
[ Square logo ]  Card Payment via Square
   [ Google Pay button ]
   [ Card form + Pay button ]

   ── or ──

[ PayPal logo ]  Pay with PayPal
   [ Yellow PayPal button ]   <- official PayPal Smart Button
```

Once either provider captures payment, the same "Paid (brand •••• last4 / receipt)" view shows — no UI duplication.

## Credentials needed from you

PayPal requires its own app credentials. I'll request these via secrets after you confirm:

- `PAYPAL_CLIENT_ID` — public client ID (shipped to browser, OK)
- `PAYPAL_CLIENT_SECRET` — server-only secret
- `PAYPAL_ENVIRONMENT` — `sandbox` or `live` (default `live`)

You get these from the PayPal Developer Dashboard → My Apps & Credentials → create a REST app.

## Implementation

### 1. Server functions — `src/lib/paypal-payments.functions.ts`

Mirrors `square-payments.functions.ts`:

- `getPaypalWebConfig` (GET, auth) — returns `{ clientId, environment, currency: "GBP" }` so the browser can boot the PayPal JS SDK.
- `createPaypalOrder` (POST, auth) — input `{ orderId }`. Validates admin/management OR order owner. Calls PayPal `/v2/checkout/orders` to create an order with `amount = orders.total_cents / 100` GBP and `reference_id = orderId`. Returns `{ paypalOrderId }`.
- `capturePaypalOrder` (POST, auth) — input `{ orderId, paypalOrderId }`. Calls PayPal `/v2/checkout/orders/{id}/capture`, verifies the capture's `reference_id` matches `orderId` and `amount` matches `total_cents`, then:
  - Upserts `order_payments` row (re-use existing table) with `square_payment_id` replaced by a generic identifier — see schema change below.
  - Updates `orders.paid_at` / `paid_by`.
  - Inserts an `order_messages` row: `"✅ PayPal payment captured (PayPal account: name@…)."`.

Both functions use `requireSupabaseAuth` middleware and read `PAYPAL_CLIENT_SECRET` / env inside `.handler()` (never at module scope).

OAuth token: small helper `getPaypalAccessToken()` that POSTs to `/v1/oauth2/token` with basic auth (`PAYPAL_CLIENT_ID:PAYPAL_CLIENT_SECRET`). No caching needed for v1 — one extra call per payment.

### 2. Schema change — generalise `order_payments`

The current `order_payments` row stores `square_payment_id`. To support multiple providers cleanly, one new migration:

- Add `provider text not null default 'square'` (values: `square`, `paypal`)
- Add `provider_payment_id text` (mirrors the existing column for new rows)
- Backfill: `update order_payments set provider_payment_id = square_payment_id where provider_payment_id is null`
- Keep `square_payment_id` for now (don't break existing reads) but new writes go through `provider` + `provider_payment_id`

No RLS policy change needed — same authorization model.

### 3. UI — `src/routes/_authenticated/_approved/shop.tsx`

- New component `PaypalPanel({ orderId, amountCents, canPay, onChange })` styled like `SquareCardPanel`:
  - Loads `https://www.paypal.com/sdk/js?client-id=…&currency=GBP&intent=capture` once on mount.
  - Renders official `<div>` mount point; calls `window.paypal.Buttons({ style: { layout: 'horizontal', color: 'gold', shape: 'rect', label: 'paypal' }, createOrder, onApprove, onCancel, onError }).render(...)`.
  - `createOrder` → calls `createPaypalOrder` serverFn, returns `paypalOrderId`.
  - `onApprove` → calls `capturePaypalOrder`, toasts success, calls `onChange()` so the parent refetches the order/messages.
  - Identical "paid" success state as Square (re-uses the `paid` row from `order_payments` joined with provider).
- In the sales-chat order panel where `<SquareCardPanel />` is rendered, render both:
  ```tsx
  <SquareCardPanel … />
  <div className="my-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
    <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
  </div>
  <PaypalPanel … />
  ```
  Both panels share `onChange` so a successful capture from either provider refreshes the panel.

### 4. PayPal logo

Inline SVG component `<PaypalLogo />` next to `<SquareLogo />` (same approach we used for Square) — the official PayPal "PP" monogram + "PayPal" wordmark. Avoids broken external image URLs.

### 5. Tests / verification

- Verify in sandbox first with the PayPal sandbox buyer account.
- Manually pay one test order end-to-end:
  - Order moves to `paid_at = now()`
  - `order_payments` row written with `provider = 'paypal'`
  - Sales chat shows the "✅ PayPal payment captured" message (already realtime-subscribed)

## Files changed

- **new** `src/lib/paypal-payments.functions.ts`
- **new** `supabase/migrations/<timestamp>_order_payments_provider.sql`
- **edit** `src/routes/_authenticated/_approved/shop.tsx` — add `PaypalPanel` component, `PaypalLogo` SVG, render it under the Square panel.
- **secrets added** `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENVIRONMENT`.

## Out of scope (ask if you want them)

- PayPal subscriptions / recurring billing
- Refunds from the admin UI (Square refunds aren't built either)
- Saving PayPal payment methods for repeat customers

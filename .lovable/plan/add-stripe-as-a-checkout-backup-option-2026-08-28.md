# Add Stripe as a checkout backup option

## Goal
Add Lovable’s built-in Stripe card payments as a third option on the shop checkout/payment dialog, alongside the existing Square invoice and USDT options. Square remains the default selected tab.

## Current state
- `src/routes/_authenticated/_approved/shop.tsx` contains a `PayOrderDialog` with two tabs: **Square** and **USDT**.
- A fully implemented `StripePanel` component exists in the same file but is not rendered anywhere.
- `src/lib/stripe-payments.functions.ts` uses the legacy BYOK integration (`process.env.STRIPE_SECRET_KEY`).
- Order help text in the order-messages block only mentions Square and USDT.
- No Stripe webhook handler exists under `src/routes/api/public/hooks/`.

## Plan

### 1. Enable Lovable built-in Stripe payments
- Call `enable_stripe_payments` and wait for the integration to provision.
- Capture the generated server functions / knowledge files so the implementation uses the built-in path instead of the BYOK env-var functions.

### 2. Replace/adapt Stripe server functions
- Update or replace `src/lib/stripe-payments.functions.ts` to call the built-in Stripe helpers (creating payment intents, confirming payments, fetching publishable config).
- Keep the same public API surface (`getStripeWebConfig`, `createStripePaymentIntent`, `confirmStripePayment`) so the UI imports stay stable.
- Ensure the order-payment tracking in `order_payments` still writes `provider: "stripe"` and marks the order paid via the existing `mark_order_paid` RPC or direct `orders` update fallback.

### 3. Add Stripe tab to the Pay dialog
- In `PayOrderDialog`, change the `TabsList` from 2 columns to 3 and add a `TabsTrigger value="stripe">Stripe</TabsTrigger>`.
- Render `<StripePanel orderId={...} amountCents={...} canPay={true} onChange={handleChange} />` inside the new `TabsContent value="stripe"`.
- Keep `defaultValue="square"` so Square remains the first/default option.

### 4. Show Stripe on the order details page
- In the unpaid order block (around line 3800), keep `PayOrderDialog` as the primary action but ensure Stripe is available inside it.
- In the paid-order block, the existing `SquareCardPanel`/`CryptoPanel` already skip rendering when `paid.provider === "stripe"`; verify `StripePanel` with `canPay={false}` renders the paid confirmation for Stripe.

### 5. Update help copy
- Update the order-message help text (line ~1422) to mention Stripe as an available payment method and give brief instructions.

### 6. Verify and test
- Typecheck the project.
- Confirm the Pay dialog shows three tabs: Square, USDT, Stripe.
- Confirm selecting Stripe loads the card form and a test payment intent can be created.
- Confirm the order is marked paid and receipt/card details display after a successful Stripe payment.

## Files expected to change
- `src/lib/stripe-payments.functions.ts` — switch to built-in Stripe helpers.
- `src/routes/_authenticated/_approved/shop.tsx` — add Stripe tab, wire `StripePanel`, update help text.
- Possibly `src/routes/api/public/hooks/stripe.ts` — add or rely on built-in Stripe webhook handling if not automatically provided.

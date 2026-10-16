# Add "Pay by bank" (open banking) to the secure checkout

## What the customer sees
- A new **Pay by bank** option on the secure checkout page, next to the card options.
- The customer chooses their UK bank, approves the payment in their banking app, and is sent back to the order page.
- The money goes straight from their account to yours. No card is used, so banks don't refuse it the way they refuse cards.
- Once the payment arrives, the order is marked paid automatically, with the same "payment received" message and the same protection against paying twice.

## How it works
This uses Stripe's **Pay by Bank** feature, which runs on your existing Stripe setup, so there's no new account. It works for UK banks only and only in pounds.

## Limits
- Pay by Bank must be switched on for your Stripe account. If Stripe hasn't turned it on yet, the option won't show and card payment shows instead. I'll check this during the build and tell you.
- Refunds are made from the admin side as normal.

## Technical details
- `src/lib/checkout-pay.functions.ts`: `checkoutStripeSession` takes an optional `bank: boolean`. When it's set, the embedded session is created with `payment_method_types: ["pay_by_bank"]` (GBP), using the same lock, double-payment guard, `order_payments` upsert and `syncStripeSession` paid detection. If Stripe rejects the method, return a clear error ("Pay by bank isn't available right now — please pay by card").
- `CheckoutCardPayment.tsx`: on the Stripe method, add a "Pay by bank" / "Pay by card" toggle. Each mode caches its own session, and switching modes expires the other open session.
- Shop payment picker and admin order label: show "Card or bank" for the Stripe method. The stored method stays `stripe`, so Profit & costs grouping is unchanged.
- Verify by creating a sandbox Pay by Bank session on the test order and confirming the bank picker loads.

# Secure checkout: Square and crypto only, auto-post Square invoice link

## What changes
1. **Hide Stripe on secure checkout (temporarily)**
   - Secure checkout payment choices show only Square and crypto (USDT). Bank transfer and cash stay as they are today where already allowed.
   - Remove the Stripe option from the places a secure checkout payment method is picked: the Add order page, the order status method picker, the Shop checkout method chooser, and the payment tabs in the Shop and order payment pop-up.
   - Any existing unpaid secure checkout still set to Stripe shows the Square invoice instead, so no customer is stuck.
   - Nothing is deleted: Stripe stays connected behind the scenes and can be switched back on later from one setting. Past Stripe payments and receipts still show correctly.

2. **Square: automatically post the invoice link in the checkout chat**
   - When a Square invoice is created for an order, a message is posted automatically in that order's secure checkout chat, e.g. "Here is your Square invoice for £65.00 — tap to pay: <link>".
   - Posted once per invoice only. Reusing the same invoice does not post again. If a new invoice replaces an old one, the new link is posted.
   - The link also stays visible on the payment panel as now.

## Technical details
- Add a single flag (`STRIPE_CHECKOUT_ENABLED = false`) in a shared payment-methods module; all method pickers and tab lists read it, so re-enabling is one change.
- Checkout method selection treats `stripe` as `square` while the flag is off (client display and `createProviderInvoice` provider choice), never creating new Stripe invoices.
- In `createProviderInvoice` (`src/lib/provider-invoices.server.ts`), after a new Square invoice row saves successfully, insert a staff-sender row into `checkout_chat_messages` with the public invoice URL and amount. Skip when an existing invoice is reused.
- Add a test: Stripe hidden from method list while flagged off; the chat link is posted only on new Square invoice creation.
- Locked Talk/ticket code untouched.

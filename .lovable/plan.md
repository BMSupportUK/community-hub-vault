# Swap Pay by Bank from Stripe to GoCardless

## What I'd need from you
1. **A GoCardless merchant account** with **Instant Bank Pay** turned on. This is GoCardless's one-off open banking payment. You may have to ask GoCardless support to enable it.
2. **A live access token** from the GoCardless dashboard (Developers → Create access token, read-write). I'll ask for it in a secure box. Don't paste it in chat.
3. **A sandbox access token** as well, if you'd like a £1 test first. This is optional but recommended.
4. **A webhook secret.** I'll give you the web address to put into GoCardless (Developers → Webhooks). GoCardless then shows you a secret, and you paste it into the secure box I send you.
5. **Confirmation that your payout bank account is verified in GoCardless**, so the money reaches you.

## What the customer would see
- The same "Pay by bank" button, first on the secure checkout. It opens GoCardless's bank picker in the centre of the screen. GoCardless supports most UK banks, Barclays included.
- They approve the payment in their banking app and come back to the order page. The order is then marked paid automatically.
- The "My bank isn't listed" option, the Square card fallback and crypto all stay the same.
- GoCardless won't send its own receipt. Your BM Support invoices stay as they are.

## What stays the same
- Profit & costs keeps its Open Banking tab, and the real GoCardless fee is subtracted from profit.
- Orders shows "Open Banking" only once the payment is confirmed. Until then it shows Pending.
- Past Stripe Open Banking orders keep their fees and labels. Stripe stays connected, so we can switch back.

## Things to check with GoCardless
- Their fee for Instant Bank Pay. Stripe charges 0.5% + 20p. Ask GoCardless for their current UK rate.
- How quickly the money is paid out to you. GoCardless usually takes a few working days.
- **Business address:** GoCardless needs your address when you sign up, and it may appear in the emails they send customers. Ask them to switch off customer emails, or to use your own emails instead. The customer's bank screen shows only your business name.

## Business address on our side
- Our own BM Support invoices and receipts won't show your business address. I'll check them during the build and remove it if it appears anywhere.

## Technical details
- New `gocardless.server.ts`: Billing Request plus Billing Request Flow (`payment_request`, GBP, `scheme: faster_payments`), with sandbox/live chosen from the token. Secrets: `GOCARDLESS_ACCESS_TOKEN_LIVE`, `GOCARDLESS_ACCESS_TOKEN_SANDBOX`, `GOCARDLESS_WEBHOOK_SECRET`.
- `PayByBankSection` calls a new `checkoutGoCardlessBank` server function (same token/password gate, pay-choice lock and double-payment guard). It opens the flow's `authorisation_url` in the existing dialog, falling back to a redirect if the bank blocks embedding.
- New `src/routes/api/public/hooks/gocardless.ts`: checks the HMAC `Webhook-Signature`, handles `payments.confirmed`/`paid_out`/`failed`, upserts `order_payments` with provider `gocardless` and method type `open_banking`, and runs the existing paid flow.
- The reconciliation job also polls GoCardless payment status for unpaid orders.
- Fees: read the GoCardless payout items so the real fee is stored in `provider_fee_cents`, provisional until paid out.
- Profit grouping maps `gocardless` to the Open Banking group. Tests cover that grouping, webhook signature rejection and paid detection.
- A single flag switches between Stripe and GoCardless for Pay by Bank.

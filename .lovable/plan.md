# Your own bank payment system (no card fees)

Customers pay straight into your Wise account. The site confirms each payment on its own, with no Square or Stripe fees. Most of this already exists: each order gets a unique BM-xxxxxx reference, and Wise payment emails are matched to orders automatically. This plan makes that the main way to pay and closes the gaps.

## What changes for customers
1. **Bank transfer shown first at checkout** for UK customers, labelled "Pay by bank – no fees". Card and crypto stay available below it.
2. **A clearer payment screen**: account name, sort code and account number, the exact amount and the BM reference. Each one has a Copy button, and there's a "Pay in your banking app" step guide.
3. **Instant confirmation**: as soon as the money lands, the order page shows "Payment received" and checkout carries on by itself. They don't have to wait for staff.
4. **Optional small discount** for paying by bank, e.g. £1 off (only if you want it).

## What changes for you
1. **Instant matching from Wise itself**: Wise tells the site the moment money arrives. Today the site waits for the payment email. Email matching stays as a backup.
2. **The safety rules stay as they are**: an order is only marked paid when the reference and the exact amount both match one waiting order. Anything else goes to the Bank Transfer page for you to sort by hand.
3. **Choose who can pay by bank**: everyone in the UK, or only customers you approve (how it works today), set with one switch on the Bank Transfer page.
4. **Reminder**: if a payment hasn't arrived within 24 hours, the customer gets an automatic "still waiting" chat message and email.
5. **Profit & costs** shows bank payments with a £0 fee, so you can see what you saved compared with card.

## Limits to know
- UK customers only (overseas customers keep card or crypto). This follows your existing rule.
- A bank transfer can't be reversed by the site, so refunds are sent by hand from Wise.
- Wise needs a one-time step in its settings to send payment alerts to the site. I'll give you the link to paste in.

## Technical details
- New public endpoint `src/routes/api/public/wise-webhook.ts` for the Wise `balances#credit` event. It checks Wise's signature using Wise's public key, re-fetches the transfer through the existing `wise.server.ts`, then calls `runWiseAutoMatch`. Repeat deliveries are ignored by the Wise transaction ID.
- New `app_settings` key `bank_transfer_open_to_uk`. `can_pay_by_bank_transfer` honours it, and the UK-only check is kept.
- Checkout ordering and the copy buttons go in `pay.$token.tsx` and the shop checkout. Realtime on `order_payments` drives the "Payment received" switch.
- A scheduled server route sends the 24-hour reminder, reusing `payment-outstanding-email`.
- Tests for the matching rules (the reference and amount must both match, duplicates are ignored, the UK-only gate) and for the open-to-UK switch.
- Locked video and ticket/Talk code is not touched.

# Pay by Bank (Open Banking) for approved bank transfer customers

## What it does

Approved bank transfer customers get a third way to pay: a **Pay by Bank** button.
Instead of copying the sort code and account number, the customer taps the button,
approves the payment inside their own banking app, and the money lands directly in
your business bank account. The order is marked paid automatically — no "I've sent it"
message, no staff confirmation step.

The existing manual bank transfer flow stays exactly as it is, as a fallback.

## Customer flow

1. Customer reaches the payment screen (shop checkout or ticket payment).
2. For a bank-transfer-approved customer, a **Pay by Bank** button appears next to
   the existing bank details panel.
3. Tapping it creates a GoCardless payment request for the exact order amount,
   pre-filled with your bank account as the payee and the order reference.
4. The customer is sent to a secure GoCardless page, picks their bank, and approves
   in their banking app.
5. When the payment is confirmed (usually within minutes), a webhook from GoCardless
   marks the order paid and posts the usual "payment received" notice in the order ticket.
6. If the customer abandons the flow, nothing changes — the order stays unpaid and the
   manual reference remains valid.

## Provider: GoCardless

- Pay by Bank / Instant Bank Pay, UK Faster Payments, one-off payments.
- Fees: 1% + 20p per payment, capped at £4 (GoCardless Standard).
- Requires your own GoCardless account with a completed business verification
  (identity + bank check) before live payments work.
- No ready-made connector exists, so the access token is stored as a project secret
  and the GoCardless REST API is called from server functions.

## Setup steps (your part)

1. I build the integration against GoCardless sandbox first.
2. You create a GoCardless account and paste the API access token when prompted —
   it is stored securely and never shown in code or pages.
3. You complete GoCardless business verification (a short online check).
4. Switch to live tokens; Pay by Bank goes live for approved customers.

## Technical details

- New secret: `GOCARDLESS_ACCESS_TOKEN` (plus `GOCARDLESS_WEBHOOK_SECRET` for
  webhook signature verification). Sandbox/live selected by token type.
- Server functions in `src/lib/gocardless.functions.ts`:
  - `createPayByBankOrder(orderId)` — owner of the order, checks the existing
    `can_pay_by_bank_transfer` permission, creates a GoCardless billing request flow
    with the reference from `buildReference`, returns the hosted payment URL.
  - `getPayByBankStatus(orderId)` — current state for the payment screen.
  - Admin connect-status function for the Bank details tab.
- Webhook route: `src/routes/api/public/webhooks/gocardless.ts` — verifies the
  GoCardless webhook signature before anything else; on `payments.paid_out` /
  confirmed, settles the order through the same `mark_order_paid` path used by
  manual confirmation, records the GoCardless payment id on `order_payments`
  (provider `pay_by_bank`), and posts the payment-received notice.
- Database: add `pay_by_bank` to the payment provider values; store the billing
  request flow id and GoCardless payment id so statuses survive refreshes.
- UI changes:
  - `src/routes/_authenticated/_approved/shop.tsx` — Pay by Bank button in the
    payment dialog for bank-only/bank-approved customers; status line while waiting.
  - `src/routes/_authenticated/_approved/tickets.tsx` — same button on the ticket
    payment panel; webhook settlement replaces manual tick when paid this way.
  - Admin dashboard Bank details tab — "Pay by Bank" status card (connected/not,
    environment) and the secret setup prompt.
- Existing behavior untouched: manual bank details, reference generation,
  "I've sent it" reporting, staff confirmation, Stripe/Square/NowPayments.

## Out of scope for this build

- Statement reading / auto-matching of ordinary manual transfers.
- Recurring Pay by Bank mandates.

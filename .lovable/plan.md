# Bank payments without showing your account details

With a normal bank transfer, the customer always sees the name, sort code and account number they pay. To hide them, the customer approves the payment in their own banking app (open banking). The money still goes into your account, and they never see the details.

## Recommended: open-banking "Pay by bank" as the main option
1. At checkout, UK customers see "Pay by bank – no card fees" first.
2. They pick their bank, approve the payment in their banking app, and land back on the order page with "Payment received". Checkout carries on by itself.
3. Your account details stay hidden: the payment screen shows only "BM Support" and the amount.
4. Fees are much lower than card: a small flat fee per payment, or a low percentage, depending on the provider. Payments arrive instantly and can't be charged back like card payments.
5. Profit & costs shows each fee as usual.

Provider options (you'd choose one):
- **Stripe Pay by bank**: already switched on in your site. No new account needed, so it's the quickest. Its fee is lower than card.
- **GoCardless Instant Bank Pay** or **TrueLayer**: usually the cheapest per payment. Each needs a new business sign-up.

## Manual Wise transfer: kept, but locked down
- Only customers you approve can see your details (as today), and only inside their own password-protected order page.
- The details disappear once the order is paid or cancelled.
- No details appear in emails, chat messages or receipts.
- The existing automatic matching by BM reference and exact amount stays.

## What I need from you
- Which provider: Stripe (no extra setup) or GoCardless/TrueLayer (the lowest fees, but you need to open an account).

## Technical details
- Stripe route: reuse the existing Pay by bank flow and invoice creation. Put it first at checkout for UK customers, and confirm payment through the existing webhook and Realtime on `order_payments`.
- GoCardless/TrueLayer route: add a server function to create the payment request and a signed webhook at `src/routes/api/public/<provider>-webhook.ts` that marks the order paid. The API key is stored as a secret.
- Bank detail display in `pay.$token.tsx` is gated by `can_pay_by_bank_transfer`, shown only while the order is unpaid, and never added to chat or email templates.
- Tests: details hidden after payment and for non-approved customers; a webhook with a bad signature is rejected.
- Locked video and ticket/Talk code is not touched.

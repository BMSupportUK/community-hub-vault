# Hide non-BM Support Wise payments

Your Wise feed currently lists every payment that lands in the account, including ones that have nothing to do with BM Support (for example today's £20 from "JACKSON G", reference "WISE", which matches no order).

## What changes
- The Incoming transfers list and the Bank Transfer page show only payments that belong to BM Support:
  - payments already matched to an order, or
  - payments whose reference contains a BM Support order reference or payment code, or
  - payments whose amount matches a waiting bank-transfer order ("possible match").
- Everything else is hidden from the list and never counted, auto-matched or notified about.
- A small "Show other payments (N)" link at the bottom lets you peek at the hidden ones if you ever need to, collapsed by default.
- Nothing is deleted, and the confirm / auto-match flow for real BM Support payments stays exactly the same.

## Technical notes
- Add a pure `isBmSupportPayment(row, awaitingOrders)` helper used by `wise.functions.ts` to split the feed into `rows` and `otherRows`; `WiseIncomingCard` renders `otherRows` behind a collapsed toggle.
- Applies to both the Wise statement feed and Gmail-forwarded `wise_email_payments`.
- Add a small bun test: matched ref kept, amount-only match kept, unrelated "WISE" £20 hidden.

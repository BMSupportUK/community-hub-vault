# Live Wise feed for bank transfers (auto-list, one-tap confirm)

Pull incoming transfers from your Wise business account into the app so you can see every payment land — matched to its order — without ever opening the bank app.

## How it works

1. You create one API token in your Wise settings (Settings → API tokens, full read access). You paste it once into a secure form; it is stored as a server-only secret and never shown again or exposed to the browser.
2. When you open the Bank Transfer page, the app quietly asks Wise for the last 7 days of account activity and shows every incoming payment: date, sender name, amount, and the reference the sender typed.
3. Each incoming payment is matched against pending bank-transfer orders: if the reference contains the order's payment code (e.g. `BM-4F9C21`) and the amount matches, the row is paired with that order, customer name and amount shown.
4. A one-tap **Confirm received** button on a matched row does exactly what confirming on the order does today — marks the order paid, posts the payment-received message to the support ticket, and notifies the customer. Nothing else changes.
5. The list refreshes itself every 60 seconds while the page is open. Unmatched incoming payments still appear (with sender + reference) so nothing is missed — you can open the matching order from there.

## Where it lives

- New **Incoming transfers** card at the top of the existing Bank Transfer admin page (`/admin-bank-transfer`, Owner tools). Owner-only, same as the rest of that page.
- Confirming from the list uses the existing `confirmBankTransferReceived` path, so staff/management can also confirm from an order as before. Only the owner sees the Wise feed card.
- Existing manual workflow (customer reports transfer, staff confirm) stays exactly as is — the Wise feed is an extra, faster shortcut.

## Security notes

- The Wise token lives in the secret store and is read only inside server code. The admin page only ever receives transaction rows (date, sender, amount, reference) — never the token.
- The feed is read-only: nothing in the app can move or send money through Wise.

## Technical notes

- Secret: `WISE_API_TOKEN` (added via the secure form after you approve this plan; you'll paste the token from your Wise settings).
- New `src/lib/wise.server.ts` helper + owner-only server functions in `src/lib/wise.functions.ts`: `getWiseIncomingTransfers` (statement fetch for the last 7 days, GBP credits only, tolerant of Wise API shape) and the confirm call reusing `confirmBankTransferReceived`.
- Matching logic: pending `order_payments` with provider `bank_transfer` + order totals; case-insensitive reference match on the `BM-XXXXXX` code, amount equality as a second check. Amount-only matches show as "possible match" with the order link.
- Refresh: client-side polling every 60s while the card is visible; no background jobs.
- If Wise's statement endpoint turns out to be restricted for this token type, I'll tell you exactly what to enable in Wise settings rather than guessing — the page shows a clear setup message in that case.

# Auto-mark Wise payments that clearly match an order

## Overview

Today an incoming Wise payment email is read via CloudMailin, saved under **Incoming transfers**, and an admin/management must manually pick the order and confirm before it's marked as payment received.

This change adds an automatic path: when a Wise payment **clearly** matches exactly one order awaiting payment — by payment reference **and** amount — the system ties it to that order and marks the payment as received on its own. A confirmation of the auto-mark is shown to admin/management (staff notification + ticket note). Anything not clearly certain stays on the manual path exactly as today.

## How it flows after this change

```text
Wise email -> Gmail filter -> CloudMailin -> app webhook
    -> saved under Incoming transfers (as today)
    -> auto-match check:
         exactly ONE awaiting order whose payment reference appears
         in the email, AND the amount matches to the penny
              -> tie to that order
              -> mark payment received (order paid)
              -> automated "Bank transfer received" message to the ticket
              -> silent staff note (Wise transfer number + auto-matched)
              -> staff bell notification to admin/management
         anything else (no match, 2+ possible orders, wrong amount)
              -> left for manual allocation, exactly as today
```

## What counts as "certain"

- The order's unique payment reference (e.g. `BM-7180AB`) appears in the Wise email's reference/transfer text.
- The reference matches **exactly one** order currently awaiting a bank transfer payment.
- The email amount equals the order amount (pence-exact, same currency).
- No reference match alone is never enough — a payment that only matches by amount is left manual.
- A payment is only ever tied to an order once; already-tied payments are never re-processed.

## What stays manual

- Payments with no clear reference match, several possible orders, or an amount mismatch.
- Cancelling orders.
- Undoing a match: admin can still open the payment and reallocate it manually before confirming anything further.

## Safety

- The order's own payment reference (BM-xxxxxx) is what the customer is told to quote, so a correct match means the money is the customer's — same check you do by eye today.
- Amount must match to the penny; a £60 order can never be settled by a £50 transfer.
- Manual allocation, the confirm/cancel dialogs, and the awaiting-payment sidebar are unchanged for anything left unmatched.

## Technical notes

- `src/lib/wise.functions.ts`: new server-side matcher (admin/management only) that loads unallocated `wise_email_payments` rows, builds the awaiting list from `order_payments` (`awaiting_verification`) plus unpaid orders of customers with a live bank-transfer grant, normalizes both sides (uppercase, strip spaces/punctuation), requires the order reference as a whole word in the email reference, exactly one candidate, and amount equality. On success it sets `matched_order_id`, then runs the same settlement steps used by `confirmBankTransferReceived` (order payment row -> paid with the Wise transfer number, order -> paid, automated customer notice, silent staff note) using the system as the actor, and records the match as automatic.
- Small migration: add an `auto_matched` flag column on `wise_email_payments` so the UI can badge automatic matches ("Auto-matched").
- The matcher runs in two places: right after the webhook saves a new payment email, and whenever the Incoming transfers list is loaded (catches anything missed).
- `WiseIncomingCard.tsx` / awaiting sidebar: show an "Auto-matched" badge on automatically tied payments and a "Marked as received automatically" confirmation on them; manual selection UI unchanged.
- Staff notification reuse: the existing staff-bell payment notification will say the payment was auto-matched and marked as received, linking to the Bank transfer orders tab as today.

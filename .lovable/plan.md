# Auto-tie incoming bank transfers to orders

## What you get

When a Wise payment email lands, the system reads the reference the sender typed and, if it matches an order's payment reference (BM-xxxxx), ties the payment to that order automatically — no selecting, no manual allocation. Admin and management then just approve the payment as they do now.

- If the reference in the email matches exactly one order awaiting payment → payment is tied automatically, a silent staff note goes to that order's ticket ("auto-matched by reference"), and if the amount is different from the order total it gets flagged for attention.
- If the reference matches more than one order or none at all (e.g. the customer didn't quote the reference) → nothing is auto-tied and it stays in the manual allocation list as it works today.
- Anything you allocated by hand is never overwritten.
- The **Incoming transfers** list shows an "Auto-matched" badge on tied payments, and the usual order link appears in Bank transfer orders.

## How it works (technical)

- `src/lib/bank-transfer.functions.ts` — export the reference builder (`buildReference`) and its normalisation so matching code can derive each order's reference from the order id (works even for orders where the customer never opened the bank details panel).
- `src/lib/wise.functions.ts` — new server function `autoMatchWisePayments` (admin/management only):
  - Load unallocated `wise_email_payments` rows.
  - Load orders awaiting bank-transfer payment (same list the Awaiting payment sidebar uses) and derive each one's reference using the saved `reference_prefix` (default `BM`).
  - Normalise both sides (uppercase, strip spaces/punctuation) and require the order's reference to appear in the email reference as a whole word — so "BM-7180AB", "bm7180ab" and "for BM-7180AB thanks" all match.
  - Exactly one match → set `matched_order_id`, post the silent staff ticket note, flag `amount_cents` mismatch in the note.
  - Only ever fills `matched_order_id` where it is still null; never touches manual allocations.
- `src/routes/api/public/wise-email.ts` — after inserting a new payment, call the matcher inline so new payments are tied the moment they arrive.
- `src/lib/wise.functions.ts` feed loader — also run the matcher when the incoming list is loaded, so anything that arrived while nobody was looking gets tied and old unallocated payments get picked up.
- `src/components/app/WiseIncomingCard.tsx` — show the "Auto-matched" badge on tied payments (distinguishable from hand-allocated ones).

## Safety

- Reference matching only: amount-only matches are never auto-tied (too risky) — they stay manual.
- Each order and payment can still only be tied once.
- Approval of the payment (marking it received) stays a separate admin/management action with its confirmation step, unchanged.

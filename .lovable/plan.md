# Sale Complete → auto-extend the customer's account

When staff press **Sale Complete** on a ticket, the customer's credential should be renewed automatically instead of being edited by hand: expiry pushed forward by the months purchased, and the account type (Single / Multi-room / Triple-room) set to match what they bought. Credential panels then update live everywhere.

## How the purchase is read

Products already carry the term and room type in their names, e.g.

```text
BM Support Digital Service 1 Month | Single User      -> 1 month,  single
BM Support Digital Service 6 Months | Single User     -> 6 months, single
BM Support Digital Service 12 Months | Multi Room     -> 12 months, multi
BM Support Digital Service 12 Months | Triple Room    -> 12 months, triple
BM Support 12 Month Package                           -> 12 months, type unchanged
```

Every line on the order is read: months = term x quantity, summed. Account type comes from the room wording; if a product says nothing about rooms, the existing type is left alone. Anything unparseable is reported to staff rather than guessed.

## Which account gets extended

1. If the order is a renewal and names an existing login, the credential with that login (owned by the order's customer) is used.
2. Otherwise, if the customer has exactly one credential, that one is used.
3. If the customer has several credentials and the order doesn't name one, staff are shown a small picker on the ticket to choose the account before it is applied.
4. If the customer has no credential yet (a brand-new sale), nothing is changed and staff are told to create the credential first — the sale still completes.

## Extending the expiry

New expiry = later of (current expiry, now) + purchased months. So renewing early stacks the time on rather than losing it, and a long-lapsed account restarts from today. Account type is overwritten only when the purchase specifies one.

## What staff see

- The Sale Complete confirmation toast and an automatic ticket message state the new expiry date and account type, so the customer sees the renewal in the ticket too.
- If the account can't be determined, a clear warning appears and the credential is left untouched.
- Re-pressing on an already-completed order does nothing (no double extensions).

## Live updates

Credential panels (customer profile Credentials tab, subscription card, admin Credentials page, shop account list) refresh the moment a credential changes — no reload needed.

## Technical notes

- New server function `src/lib/order-fulfilment.functions.ts`:
  - `applyOrderToCredential` — auth middleware + admin/management/staff role check, reads `orders` + `order_items`, derives months/type, resolves the target credential, updates `expiry_at` and `account_type` via the privileged client, returns a result describing what happened (or `needs_selection` with candidate accounts).
  - Term/type parsing lives in a shared pure helper so it can be unit-tested.
- `orderCompleteSale` in `src/routes/_authenticated/_approved/tickets.tsx` calls it after the order is marked completed and the subscriber role is applied; on `needs_selection` it opens an account picker dialog and re-calls with the chosen credential id.
- Migration: new `public.credential_change_events` table (credential_id, owner_id, changed_at) with GRANTs and RLS (owner reads own rows; admin/management/staff read all), plus an `AFTER INSERT OR UPDATE` trigger on the credentials table that records a row, and the table added to the realtime publication. Credential-showing components subscribe and refetch on change.
- The existing subscriber-role sync stays as-is; extending expiry naturally keeps the `subscriber` role in place instead of it lapsing to Expired Subscription.

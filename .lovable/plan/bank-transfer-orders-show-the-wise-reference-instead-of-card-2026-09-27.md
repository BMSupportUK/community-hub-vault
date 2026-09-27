# Bank transfer orders: show the Wise reference instead of "Card"

## What you'll see

On the **Bank transfer orders** tab, the last column currently says **Card** and shows "—" for every row. After this change:

- The column is renamed to **Reference**.
- Each bank transfer row shows the Wise transfer number saved against that payment (e.g. `#2392929350`), or "—" if none was recorded.
- Square and Stripe tabs keep their existing **Card** column (card brand + last 4) — this change only affects the bank transfer view.
- Paul's completed order (25 Sept, £60) will show the reference **#2392929350**.

## Changes

1. **`src/components/app/CardPaymentsAdminCard.tsx`**
   - When the provider is `bank_transfer`, the column header reads "Reference" instead of "Card".
   - For bank transfer rows, the cell shows `provider_payment_id` (where the Wise transfer number is stored when you confirm a bank transfer with the Wise transfer no. box); other providers keep the card brand / last-4 display.
   - Add `provider_payment_id` to the payment query's selected columns.

2. **Backfill Paul's order (data update, one-off)**
   - Update the bank transfer payment for order `7180ab52-…` (Paul belton, £60, 25 Sept 2026): set `provider_payment_id` from `BM-7180AB` to `#2392929350`.
   - The other bank transfer payment (August, £15) is left as-is since no Wise reference was given for it.

## Notes

- No database structure changes — the Wise number already lives in `provider_payment_id`; this is a display change plus one data fix.
- Future bank transfers confirmed with the Wise transfer no. box will show their number here automatically.

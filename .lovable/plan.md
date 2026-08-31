# Bank Transfer payments (owner-controlled)

Let approved customers pay by bank transfer instead of card/crypto, with bank details managed by the owner only.

## Owner panel (Admin Dashboard → Owner tools)

New "Bank Transfer" section, visible and usable by the Owner role only:

- **Bank details form**: account name, sort code, account number, IBAN/BIC (optional), payment reference prefix, free-text instructions. Stored server-side; no other role can read or edit them in the admin panel.
- **Permitted customers list**: search a user, grant "can pay by bank transfer", with an optional expiry date. Table of current grants showing who granted it, when, and expiry, plus a Revoke action. Expired grants stop working automatically.

## Customer checkout

When the signed-in customer has a live bank-transfer grant, the "Choose how to pay" dialog:

- Hides Square, Stripe and USDT entirely and shows a single **Bank Transfer** panel.
- **Show Bank Details** button opens a popup with the bank details, each field copyable.
- Under the details, a **payment reference** unique to that order (e.g. `BM-4F9C21`), generated once and reused on every reopen, with a copy button and a note that it must be quoted on the transfer.
- **I've transferred the money** button. Pressing it:
  - Records the order payment as bank transfer, status `awaiting_verification` (order is not marked paid).
  - Posts an automatic message to the order's support ticket (creating an Orders ticket if none is linked, same as the existing card notice) stating the amount, the reference, the time, and asking staff to check the bank account and confirm.
  - Notifies staff and shows the customer a confirmation.
  - Is idempotent — repeat presses don't post duplicate messages.

Customers without a grant see today's payment options, unchanged.

## Payment status box

`PaymentStatusTimeline` gains a `bank_transfer` method and an "Awaiting bank transfer verification" state:

- Awaiting payment → Transfer reported (with reference) → Staff verification → Payment confirmed.
- Once staff mark the order paid, it settles to the normal confirmed state and the existing payment-received notice/alert flow applies.
- Staff/owner see a "Confirm bank transfer received" action on the order which marks it paid, using the existing paid-order plumbing.

## Technical notes

- Migration: `bank_transfer_permissions` (user_id, granted_by, expires_at, revoked_at) and `bank_transfer_details` (single settings row), both with grants and RLS. Direct client reads of the details table are denied; a `public.can_pay_by_bank_transfer(uuid)` security-definer helper backs policies. Bank-transfer reference stored on `order_payments` (provider `bank_transfer`, existing `provider_payment_id` column).
- New `src/lib/bank-transfer.functions.ts` server functions, all behind `requireSupabaseAuth`: owner-only get/save details and grant/revoke; customer-side `getMyBankTransferAccess` (grant + order reference), `getBankDetailsForOrder` (only for a granted user with an unpaid order), `reportBankTransferSent`, and a staff/owner `confirmBankTransferReceived`.
- Ticket message reuses the notice pattern in `order-payment-notice.server.ts` with a `BANK-TRANSFER-REPORTED:<orderId>` marker for idempotency.
- Both payment dialogs (`src/components/app/OrderPaymentDialog.tsx` and the copy inside `shop.tsx`) get the same gating so checkout behaves identically in Shop and Tickets.

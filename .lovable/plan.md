# Every shop order uses the secure checkout page

## What changes for customers
1. Customer adds items in the shop and checks out.
2. The checkout form asks how they want to pay:
   - **Square (card)** is selected by default and marked "Preferred".
   - Stripe (card) is the other option.
   - **Customers set up for bank transfer** don't get a choice. They only see "Bank transfer".
3. When they place the order, they go straight to that order's own secure checkout page. No support ticket is opened and no password is needed, because they're already signed in as the order's owner.
4. On the secure page:
   - **Square / Stripe:** a card form sits inline on the page, with no invoice link. Once the payment goes through, the page moves to "Payment received".
   - **Bank transfer:** bank details and the reference warning appear in the right sidebar, like manual orders do today.
   - The order chat bubble replaces the ticket for questions. Staff get the same new-chat alert and can reply from the admin Secure page.
5. On "My orders", the "Open ticket" button becomes "Open secure checkout".

## What changes for staff
- New shop orders no longer create tickets in the "Orders" category, and they no longer post automated ticket messages.
- Every order, not just manual ones, gets a "Secure page" button in the admin orders list.
- Manual orders also switch to inline card payment for Stripe and Square, instead of invoices.
- Old orders keep their existing tickets and invoices. They're left untouched and still show where they are today.

## Technical details
- **Database migration:**
  - Allow `order_checkout_links` rows for non-private (shop) orders.
  - Add an owner-access path: a `get_my_checkout_token(order_id)` security-definer function that returns or creates the link for `auth.uid()`'s own order.
  - The password stays only for guests who use a shared link.
- **`checkout.functions.ts`:**
  - `getCheckout` accepts either the password or an authenticated owner session.
  - Chat send and list do the same.
- **`shop.tsx` place-order flow:**
  - Remove the ticket and ticket_messages block around lines 1453–1531.
  - After the order is created, get the token and `navigate('/pay/$token')`.
  - The method picker defaults to `square`. If `getMyBankTransferAccess().allowed`, only `bank_transfer` is shown.
- **`pay.$token.tsx`:** skip the password screen when a signed-in owner loads the page successfully.
- **`CheckoutTemplate.tsx`:**
  - Stripe and Square branches render the inline card forms, reusing the existing `chargeOrderWithSquare` (Square Web Payments card) and `createStripePaymentIntent`/`confirmStripePayment` payment functions.
  - The "Pay invoice" buttons are removed.
- **`admin-add-order.tsx`:** stop calling `createSquareInvoiceForOrder`/`createStripeInvoiceForOrder`.
- The invoice functions and existing order tickets stay in place for historic orders. Nothing is deleted.

## Open point
Guests who aren't signed in can't place shop orders today, and that stays the same.

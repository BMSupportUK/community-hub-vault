# Manual orders with secure customer checkout pages

## What you get

1. **Add an order form** gains:
   - Customer email box (optional, admin/management only see it afterwards).
   - Discount box (£ amount taken off the total, shown live under the total).
2. **Every manual order gets its own secure checkout page** at a long random link (e.g. `/pay/<secret-token>`). Anyone with the link can view it; nobody can guess it. The link is saved on the order and shown in the order's page in Admin.
3. **Checkout page layout** (one template per payment method, all sharing the same look):
   - Digital illustration header: a family watching TV together on the sofa.
   - Order number, customer name, date.
   - Item breakdown: each item, quantity, price; discount line struck through / shown as minus; final total.
   - Status bar across the top: Created → Awaiting payment → Paid → Completed.
   - Payment section, depending on the method picked:
     - **Stripe** — creates a Stripe invoice and shows a "Pay invoice" button.
     - **Square** — creates a Square invoice and shows a "Pay invoice" button.
     - **Wise / Bank transfer** — shows your bank details with a bold warning box: "You MUST use your Order Number (MANUAL-xxxx) as the payment reference, or your payment cannot be matched."
     - Cash / Crypto — shows simple instructions only.
4. **After saving the order** a confirmation screen shows the link with a "Copy secure link" button (also available on the order in Admin at any time).
5. **Admin dashboard** gets a "Checkout templates" preview so you can see each of the Stripe, Square and Wise templates.
6. **Status bar on every order** in the Admin order list, showing the same stages.
7. **Completed manual orders move into their payment type tab** (Square, Stripe, Wise, Cash, Crypto) in the sales/profit view, as soon as they are marked complete, and are counted there.

## Technical details

- Migration: add `checkout_token` (unique, random 32-byte hex) to `orders`; extend `admin_create_manual_order` with `_email` and `_discount_cents` params (email stored encrypted like existing `email_enc`, discount clamped to subtotal).
- Public read: server function `getCheckoutByToken` using admin client inside handler, returns only safe fields (ref, name, items, discount, total, status, method, invoice URL, bank details for Wise). No email returned.
- Invoice creation: reuse `createSquareInvoiceForOrder` and the Stripe invoice functions in `stripe-invoices.functions.ts`, triggered by a token-verified server function when the page is first opened (idempotent — stored in `order_invoices`).
- Wise bank details read from existing `bank_transfer_details`.
- New route `src/routes/pay.$token.tsx` with head metadata; illustration generated into `src/assets/checkout-family-tv.jpg`.
- New `OrderStatusBar` component reused on checkout page and Admin order rows.
- Admin page `admin-checkout-templates.tsx` rendering the template with sample data for each method.

## Assumptions (tell me if wrong)

- Discount is a fixed £ amount, not a percentage.
- "Sale type" means the per-payment-method tabs in the orders/profit area.

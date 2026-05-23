## Goal
On the order chat in the store (customer + admin order panel), collapse the three stacked payment panels into a single "Pay" button that opens a dialog containing the payment options, ordered: Square → PayPal → Crypto.

## Scope
File: `src/routes/_authenticated/_approved/shop.tsx` (the order detail view around lines 2085–2127). No backend / server function changes — the existing `SquareCardPanel`, `PaypalPanel`, and `CryptoPanel` components are reused as-is.

## Changes

1. **Replace the inline payment stack** in the order sidebar with a single primary CTA:
   - Button label: `Pay <amount>` (uses existing `fmt(order.total_cents)`).
   - Icon: `CreditCard` from lucide-react.
   - Shown only when: `!order.paid_at && !order.completed_at && order.status !== "cancelled"` and the viewer is admin or owner.
   - Hidden (and replaced by the existing "USDT payment in progress" notice) when `pendingCrypto` is active — crypto still locks other methods.
   - When already paid/completed, render the existing `SquareCardPanel` / `PaypalPanel` confirmation states inline as today (they self-render the paid receipt) so the user can still see which method paid.

2. **New "Choose payment method" dialog** (local component in the same file):
   - Triggered by the Pay button, controlled via `useState`.
   - Title: `Choose how to pay`, subtitle showing the amount.
   - Body contains three sections stacked in this order, each with a small heading:
     1. **Square** — renders `<SquareCardPanel />`
     2. **PayPal** — renders `<PaypalPanel />`
     3. **Crypto (USDT)** — renders `<CryptoPanel />`
   - Same `orderId`, `amountCents`, `canPay`, `onChange={load}` props as today.
   - `onChange` also closes the dialog once the order becomes paid (detected on next `load`).
   - Dividers between sections replace the existing "or" separators.

3. **Paid-state rendering** (outside the dialog):
   - Continue rendering the three panels' paid-confirmation branches inline below the order summary so the receipt remains visible without opening the dialog. (Each panel already early-returns a confirmation block when paid; we just mount them outside the dialog with `canPay={false}` when `order.paid_at` is set.)

## Technical notes
- No prop signature changes to `SquareCardPanel`, `PaypalPanel`, `CryptoPanel`.
- Dialog uses existing `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` already imported in the file.
- No route, schema, or server-function changes.

## Out of scope
- Visual redesign of individual payment panels.
- Changing payment provider behavior, fees, or order status logic.

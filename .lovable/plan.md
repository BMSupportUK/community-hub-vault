# Add "Pay by card (via crypto)" using NOWPayments

## What the customer sees
- On the secure checkout page, the crypto payment box gets two buttons:
  - **Pay in USDT**: works the same as it does now.
  - **Pay by card**: opens NOWPayments' card checkout. The customer pays in pounds by card, and NOWPayments' card partner (Guardarian) changes it into USDT that lands in your NOWPayments account.
- The shop's payment picker shows the crypto option as "Card or crypto".
- Once the payment finishes, the order is marked paid the same way as a crypto payment, with the same "payment received" message and the same double-payment protection.

## What you need to do once
In your NOWPayments dashboard, go to Settings, then Payments, and switch on **Fiat / card payments (Guardarian)**. Card buttons don't appear on NOWPayments' payment pages until this is on. Some customers may need to verify their ID with Guardarian on bigger amounts.

## Limits
- Banks can still decline the payment. The charge goes through a regulated card company rather than showing up as a crypto exchange, so banks refuse it less often.
- Guardarian charges the customer a fee of about 3–4%.

## Technical details
- `src/lib/checkout-pay.functions.ts`: `checkoutCryptoInvoice` takes an optional `mode: "usdt" | "card"`. In card mode, the invoice is created without `pay_currency`, so the NOWPayments invoice page offers its card option, and `is_fiat` / `fiat` is set to GBP where the API supports it. Mode is stored in `order_payments.card_brand` ("CARD-VIA-CRYPTO" or "USDT-ERC20"). An open invoice is reused only when its mode matches. The existing lock, double-payment guard, IPN webhook and `syncCryptoPayment` stay as they are.
- `src/components/checkout/CheckoutCardPayment.tsx`: `CryptoPay` shows the two buttons. Card mode opens the invoice in a new tab, because the card partner refuses to run inside a frame. USDT mode keeps the in-page frame.
- `shop.tsx` and `OrderStatusAdminCard.tsx`: change the label only; the stored method stays `crypto`.
- Profit & costs grouping stays the same: everything is still under NOWPayments.
- Test: a small `bun test` checking that card mode leaves out `pay_currency` and that a card-mode invoice is never reused for USDT, or the other way round.

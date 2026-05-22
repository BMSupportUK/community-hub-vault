
# Add USDT Crypto Payments (NOWPayments, Embedded)

Add a third payment option on the order panel — **USDT** — using NOWPayments. The flow mirrors the existing PayPal integration (`src/lib/paypal-payments.functions.ts`) so the order lifecycle (`mark_order_paid` RPC, system chat message, status badges) stays identical regardless of provider.

NOWPayments is chosen because:
- Non-custodial, no KYC to start
- Native USDT support across multiple networks (TRC20 / ERC20 / BEP20 / Polygon)
- Provides an **embeddable invoice iframe** — true in-page widget, no redirect
- 0.5% fee, IPN (webhook) for confirmation
- Optional auto-conversion to fiat/stablecoin payout

## User flow

1. On the order payment panel, user picks "Pay with USDT" alongside PayPal / Card.
2. They choose network (TRC20 default — lowest fees) from a small selector.
3. App calls `createCryptoInvoice` server fn → returns NOWPayments `invoice_url` + `invoice_id`.
4. The invoice is embedded as an `<iframe>` in a dialog — shows QR code, address, amount in USDT, countdown.
5. User pays from their wallet. NOWPayments detects the on-chain payment.
6. NOWPayments POSTs IPN webhook → our `/api/public/hooks/nowpayments` route verifies HMAC signature → on `finished` status, marks order paid via the same `mark_order_paid` RPC, posts `✅ USDT payment received (TRC20, 0xabc…).` system message.
7. Client polls invoice status every 5s (fallback in case IPN is delayed) and closes the dialog on success.

## Files to add

```text
src/lib/nowpayments.functions.ts         # createCryptoInvoice, getCryptoInvoiceStatus, getNowPaymentsConfig
src/routes/api/public/hooks/nowpayments.ts # IPN webhook handler (HMAC verified)
src/components/app/CryptoPayButton.tsx   # button + dialog hosting the iframe + status polling
```

## Files to edit

- The existing order payment UI (same place PayPal & Square buttons live) — add the third "Pay with USDT" option and network selector. I'll locate it during build (likely a component inside `src/routes/_authenticated/_approved/` order panel).
- `order_payments` table already supports multi-provider (PayPal uses `provider='paypal'`, `provider_payment_id`) — reuse with `provider='nowpayments'`, `provider_payment_id=<invoice_id>`, `card_brand='USDT-TRC20'`, `last_4=<tx hash last 8>`.

## Secrets needed (added via `add_secret`)

- `NOWPAYMENTS_API_KEY` — server API key (NOWPayments dashboard → Store Settings → API keys)
- `NOWPAYMENTS_IPN_SECRET` — IPN secret for webhook HMAC verification (Store Settings → IPN)

No DB migration required — `order_payments` already accommodates this. If you want richer crypto metadata later (network, tx hash, confirmations) we can add nullable columns; for v1 we'll stuff network into `card_brand` and tx hash prefix into `last_4` to match the existing PayPal pattern.

## Webhook URL to configure in NOWPayments

`https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/nowpayments`

(Stable URL — works for both preview and live.)

## Security checklist

- IPN handler verifies `x-nowpayments-sig` HMAC-SHA512 of sorted JSON body using `NOWPAYMENTS_IPN_SECRET`
- Server fn re-checks `assertAdminOrOrderOwner` before creating an invoice (same as PayPal)
- Order amount fetched from DB, never trusted from client
- Webhook is idempotent (upsert on `order_id`); replays don't double-pay
- Only acts on `payment_status === 'finished'` (ignore `waiting`, `confirming`, `partially_paid` for marking paid — but log them)

## Out of scope (ask later if wanted)

- Other coins (BTC, ETH, etc.) — easy to add by widening network selector
- Auto-convert to GBP payout (NOWPayments dashboard toggle — no code change)
- Partial payment handling beyond logging
- Refunds (crypto refunds are manual)

Ready to build on approval.

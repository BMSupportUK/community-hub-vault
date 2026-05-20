## Goal

Customer pays by card (Square invoice — already wired). Once Square confirms the charge, the order is flagged for a **manual USDT payout** to your cold wallet. Admin gets a queue showing exactly how much USDT to send, to which address, and marks each payout as done with a tx hash.

This is your own store, single hardcoded destination wallet, so no per-user wallet config UI.

## What stays as-is

- Card checkout flow (`createSquareInvoiceForOrder` → Square hosted invoice → `orders.paid_at` updated by existing Square webhook).
- All current shop / orders UI.

## What changes

### 1. Settings (single row, env-style)
New table `crypto_payout_settings` (one row, admin-only RLS):
- `asset` — default `USDT`
- `network` — `TRC20` | `ERC20` | `BEP20` (default `TRC20`, lowest fees)
- `wallet_address` — your cold wallet
- `fx_source` — `coingecko` (free, no key)
- `markup_pct` — buffer for exchange spread + network fee (default `1.5`)
- `min_payout_usdt` — batch threshold (default `0`)

Seeded with placeholder; admin edits in a new **Shop → Payouts** settings tab.

### 2. Payout ledger
New table `crypto_payouts`:
- `id`, `order_id` (unique), `status` (`pending` | `sent` | `skipped`)
- `gbp_amount_cents`, `gbp_to_usd_rate`, `usdt_amount` (computed at order-paid time so FX is locked)
- `wallet_address`, `network`, `asset` (snapshot)
- `tx_hash` (nullable), `sent_at`, `sent_by`, `notes`

RLS: admin/management only. Inserts via SECURITY DEFINER trigger when `orders.paid_at` transitions to non-null.

### 3. FX lookup (server fn)
`getGbpToUsdtRate()` — fetches `https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=gbp` (no key, cached 5 min in memory). USDT amount = `gbp / rate * (1 - markup_pct/100)` rounded to 2 dp.

### 4. Trigger on payment
When `orders.paid_at` becomes set (Square webhook already does this), DB trigger inserts a `crypto_payouts` row with status `pending`. The USDT amount is computed by a server fn called from the Square webhook handler right after it marks the order paid, so the FX rate is captured at payment time (triggers can't call HTTP).

Touch point: `src/routes/api/public/hooks/square-invoice.ts` — after the existing `paid_at` update, call a new internal helper `recordCryptoPayoutForOrder(orderId)` that reads settings, fetches rate, inserts the ledger row.

### 5. Admin "Crypto payouts" page
New route `src/routes/_authenticated/_approved/admin-payouts.tsx`:

```text
Pending payouts (3) — total 487.20 USDT

Order #a1b2c3d4   £200.00   →  158.40 USDT   TRC20  T9zk...4f   [Copy addr] [Copy amt] [Mark sent]
Order #e5f6g7h8   £150.00   →  118.80 USDT   TRC20  T9zk...4f   [Copy addr] [Copy amt] [Mark sent]
...

Sent (last 30 days)              total 12,430 USDT  [Export CSV]
Order #...   £...   142.10 USDT  tx 0xabc...   2026-05-18  by Alice
```

"Mark sent" opens a small dialog: paste tx hash + optional note → status `sent`, stamps `sent_at` + `sent_by`.

Realtime subscription on `crypto_payouts` so the queue updates as new card payments come in.

### 6. Customer-facing
Nothing changes for the customer. They see the same Square invoice and "Paid" confirmation. The crypto leg is internal treasury.

## Out of scope (ask if you want any)

- Automated payout via exchange API (Binance/Kraken withdraw)
- Letting the customer pay directly in crypto
- Multi-wallet routing / per-product wallets
- Hardware wallet signing UX

## Technical details

**Files**
- `supabase/migrations/<new>.sql` — `crypto_payout_settings`, `crypto_payouts`, RLS, seed row
- `src/lib/crypto-payouts.functions.ts` — `getPayoutSettings`, `updatePayoutSettings`, `listPendingPayouts`, `listSentPayouts`, `markPayoutSent`, `getGbpToUsdtRate`, `recordCryptoPayoutForOrder`
- `src/routes/api/public/hooks/square-invoice.ts` — call `recordCryptoPayoutForOrder` after marking paid
- `src/routes/_authenticated/_approved/admin-payouts.tsx` — new admin queue + settings panel
- `src/components/app/PendingPayoutsBadge.tsx` — sidebar badge (mirrors `PendingOrdersBadge`)
- Sidebar link added wherever admin nav lives

**Security**
- All payout RPCs gated by `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management')`.
- Wallet address visible only to admin/management.
- FX call server-side only.

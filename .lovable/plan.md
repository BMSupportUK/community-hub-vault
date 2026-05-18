## Goal

From the admin view of an existing order (including ones with discounts applied), admin clicks **Create Square invoice**. We create the invoice in Square via API, drop the public payment link into the order chat, and watch Square for the payment. When Square reports it paid, the order flips to **paid**, a "Payment received ✅" message is auto-posted in the order chat, and admins get an in-app notification.

## User flow

1. Admin opens an order in the Shop admin view.
2. New panel **Square invoice** shows:
   - If none yet: button **Create & send Square invoice** (uses order total incl. discount, customer name/email from the order).
   - If one exists: status badge (Draft / Unpaid / Paid / Cancelled), invoice number, public URL, **Refresh status**, **Cancel invoice**.
3. On create, we:
   - Call Square to create the invoice for the order total.
   - Publish it (Square emails the customer automatically; we also post the payment URL as a message in the order chat).
4. Payment detection: webhook from Square (primary) + manual **Refresh status** (fallback). When status becomes `PAID`:
   - Order status → `paid` (sets `paid_at`, `paid_by = system`).
   - System message in order chat: "💷 Payment received via Square — invoice #XXXX".
   - Admin in-app notification via existing `staff_notifications`.

## Setup the admin does once

- Add Square secrets (we'll request them via the secrets tool):
  - `SQUARE_ACCESS_TOKEN`
  - `SQUARE_LOCATION_ID`
  - `SQUARE_ENVIRONMENT` (`production` or `sandbox`)
  - `SQUARE_WEBHOOK_SIGNATURE_KEY`
- In Square Dashboard → Webhooks, add subscription to events `invoice.payment_made`, `invoice.updated`, `invoice.canceled` pointing at:
  `https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/square-invoice`

## Technical plan

### Database (migration)

New table `public.order_invoices` (one row per order, latest invoice):
- `order_id uuid` FK → `private.orders.id` (unique)
- `provider text` default `'square'`
- `square_invoice_id text`, `square_order_id text`, `invoice_number text`, `public_url text`
- `status text` (`draft|unpaid|paid|canceled|failed`)
- `amount_cents int`, `currency text`
- `created_by uuid`, `created_at`, `updated_at`, `paid_at`
- RLS: select/insert/update restricted to admin+management; select also allowed to the order owner (so the customer can see status if we surface it later).

Trigger on update: when `status` transitions to `paid`, set `private.orders.status='paid'`, `paid_at=now()`, insert system row into `public.order_messages` (sender = a designated system uuid — use the admin/created_by as fallback), and insert into `public.staff_notifications`.

### Server functions (`src/lib/square-invoices.functions.ts`)

All `requireSupabaseAuth` + role check `admin|management`:
- `createSquareInvoiceForOrder({ orderId })` — reads order + items via `supabaseAdmin`, builds Square `Order` (line items + discount line) and `Invoice` (payment request: BALANCE on receipt, delivery method EMAIL + SHARE_MANUALLY), publishes it, stores row in `order_invoices`, posts message in `order_messages` with the public URL.
- `refreshSquareInvoiceStatus({ orderId })` — GET invoice from Square, update row, run paid-transition logic if needed.
- `cancelSquareInvoice({ orderId })` — POST cancel, update row.

All Square calls go to `https://connect.squareup.com/v2/...` (or `https://connect.squareupsandbox.com/v2/...`) using `process.env.SQUARE_ACCESS_TOKEN`. No SDK — plain `fetch`.

### Webhook route

`src/routes/api/public/hooks/square-invoice.ts` (TanStack server route):
- Verify HMAC SHA-256 signature header `x-square-hmacsha256-signature` against `notification_url + body` using `SQUARE_WEBHOOK_SIGNATURE_KEY` (timingSafeEqual).
- For `invoice.payment_made` / `invoice.updated` / `invoice.canceled`, find `order_invoices` by `square_invoice_id`, update status; trigger handles the paid side-effects.

### UI

In `shop.tsx` admin order detail (existing order drawer), add a `SquareInvoicePanel` component with the buttons above. Show toast on success/error. Refresh order list after status change. No changes to the customer-facing shop.

## Out of scope

- No partial payments / multi-payment-request invoices (single BALANCE request).
- No editing of invoice after sending (admin cancels + creates a new one if amount changes).
- No Square customer record sync — we pass `primary_recipient` inline from the order's name/email.

## Secrets requested next

After you approve, I'll request `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT`, `SQUARE_WEBHOOK_SIGNATURE_KEY` via the secure secrets form before writing code.

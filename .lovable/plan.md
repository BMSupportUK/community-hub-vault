## Plan: Staff notifications to Telegram + WhatsApp (Twilio)

Send a short message to one shared Telegram chat and one shared WhatsApp number whenever:
- a new account signup is submitted (`signup_info` insert)
- a new support ticket is opened (`tickets` insert)
- a new sale/order is created (`order_invoices` insert)

### Setup you'll do (one-time)

1. **Connect Telegram** — I'll trigger the connector picker. You pick the bot, then send it a message in the destination group and give me that chat ID (or I'll add a tiny `/api/public/telegram/webhook` helper that prints the chat ID into a log/table when the bot receives a message).
2. **Connect Twilio** — I'll trigger the connector picker. You'll need a WhatsApp-enabled sender (sandbox number is fine for testing, an approved business number for prod). You give me the `From` (`whatsapp:+...`) and destination `To` (`whatsapp:+...`).
3. **Store both destinations** in a new `notification_settings` table (single row, admin-editable) so they're not hard-coded.

### What I'll build

**1. DB**
- `notification_settings` table: `telegram_chat_id text`, `whatsapp_from text`, `whatsapp_to text`, `notify_signups bool`, `notify_tickets bool`, `notify_orders bool`, all admin-only RLS.
- `notification_log` table: `kind`, `channel` (telegram/whatsapp), `target_id`, `status`, `error`, `created_at` — for debugging and idempotency.

**2. Server**
- `src/lib/notify.server.ts` — two helpers: `sendTelegram(text)` and `sendWhatsApp(text)`, both calling the Lovable connector gateway (`connector-gateway.lovable.dev/telegram/sendMessage` and `/twilio/Messages.json`) using `LOVABLE_API_KEY` + `TELEGRAM_API_KEY` / `TWILIO_API_KEY`. Reads destinations from `notification_settings`. Writes outcome to `notification_log`. Never throws to the caller.
- `src/lib/notify.functions.ts` — `notifyNewSignup`, `notifyNewTicket`, `notifyNewOrder` server fns. Each formats a short message ("New ticket from @alice: 'Login broken' — open: https://bmsupport.uk/tickets/123") and fans out to both channels in parallel.

**3. Triggers** — two options, I'll use (a) for reliability:

   (a) **Postgres trigger → `/api/public/hooks/notify`** via `pg_net`. After-insert triggers on `signup_info`, `tickets`, `order_invoices` POST `{ kind, id }` to a new public route that verifies a shared header secret and calls the matching notify fn. Fires for inserts from anywhere (admin UI, Square webhook, etc.).

   (b) Alternative: call the notify fns directly from existing client/server paths that create these rows. Brittle (misses webhook-created orders), I won't use it unless you prefer.

**4. Admin UI**
- New panel under `/admin` → "Notifications": form to edit chat ID / WhatsApp from+to / per-kind toggles, plus two "Send test" buttons.
- Recent `notification_log` table (last 50) so you can see delivery status.

### Out of scope (flag for later)
- Per-staff routing, quiet hours, retries with backoff, rich Telegram formatting (inline buttons), WhatsApp template messages for outside the 24h session window. The Twilio sandbox + freeform body works for staff-to-staff alerts; once you move to a production WhatsApp sender for outbound notifications, we'll need an approved template — I'll flag it when we get there.

### Order of operations
1. Run the migration (settings + log tables).
2. Trigger `connect` for Telegram and Twilio.
3. You paste chat ID + WhatsApp numbers into the admin panel and hit "Send test" — confirms both channels work end-to-end before I wire the DB triggers.
4. Enable the triggers.

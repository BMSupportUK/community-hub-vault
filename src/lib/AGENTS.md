# src/lib rules

- Sports guides keep publication status; headings prefix events, not channels; document scrolling; channels only beneath Available channels; BM loads through hydration/router pending.
- UFC multi-time imports attach all listed channels to every slot. Triller `Event N` becomes channel `Triller TV N`.
- NHL Center Ice treats its listing clock as ET and converts to the correct UK date/time, ignoring supplied UK clocks; NFL Sunday Ticket and NBA League Pass use stated UK times.
- Sports formats need split/safety/read-back tests; normalize dual-clock typos before title pairing; DAZN inline slots stay separate, qualifiers extend titles.
- Manual sports splits preserve both halves; only adjacent headings move, and shared headings copy to the second half.
- Manual orders use password-gated checkout links and order-only chat; paid, non-cancelled orders can open published guides through the same credentials.
- Checkout mutations check admin/management in handlers/RPCs; email-free staff reads use a narrow order-summary RPC.
- Pre-account manual logins are order-private; claim moves them to customer credentials, the admin list's source of truth.
- Signed-out checkout app logins use only token-gated SECURITY DEFINER reads, never the staff credentials view.
- Square/Stripe payments use shared server invoice creation with verified order/token access; BM Support PDFs remain post-payment receipts.

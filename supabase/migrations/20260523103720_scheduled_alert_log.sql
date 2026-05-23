-- Idempotency table for the /api/public/hooks/scheduled-reminders cron.
-- Each (alert_key) row means "we already sent this reminder; don't send again".
create table if not exists public.scheduled_alert_log (
  alert_key text primary key,
  user_id uuid not null,
  sent_at timestamptz not null default now()
);

create index if not exists scheduled_alert_log_sent_at_idx
  on public.scheduled_alert_log (sent_at);

alter table public.scheduled_alert_log enable row level security;

-- No client policies: only the service role (server route) writes/reads this.

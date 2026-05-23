CREATE TABLE IF NOT EXISTS public.scheduled_alert_log (
  alert_key text PRIMARY KEY,
  user_id uuid NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_alert_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS scheduled_alert_log_sent_at_idx ON public.scheduled_alert_log (sent_at);
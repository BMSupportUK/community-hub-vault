-- Explicitly deny INSERT/UPDATE/DELETE from anon/authenticated.
-- Service role bypasses RLS, so the cron job that writes these rows is unaffected.
ALTER TABLE public.subscription_expiry_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reminders no client insert" ON public.subscription_expiry_reminders;
DROP POLICY IF EXISTS "reminders no client update" ON public.subscription_expiry_reminders;
DROP POLICY IF EXISTS "reminders no client delete" ON public.subscription_expiry_reminders;

CREATE POLICY "reminders no client insert"
  ON public.subscription_expiry_reminders
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "reminders no client update"
  ON public.subscription_expiry_reminders
  FOR UPDATE TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "reminders no client delete"
  ON public.subscription_expiry_reminders
  FOR DELETE TO anon, authenticated
  USING (false);

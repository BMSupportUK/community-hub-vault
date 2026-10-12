-- Retire the automatic travelling-home break
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-travel-home-breaks') THEN
    PERFORM cron.unschedule('auto-travel-home-breaks');
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.auto_travel_home_breaks();

COMMENT ON TYPE public.break_kind IS 'break and lunch remain in use; the travel value is retired — no new travelling-home breaks are created';
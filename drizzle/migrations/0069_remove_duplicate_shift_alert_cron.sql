SELECT cron.unschedule('shift-phone-alerts')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'shift-phone-alerts'
);

COMMENT ON FUNCTION public.queue_shift_phone_alerts() IS
'DEPRECATED: duplicate shift reminder path; scheduled-reminders handles shift alerts and suppresses start alerts after clock-in.';
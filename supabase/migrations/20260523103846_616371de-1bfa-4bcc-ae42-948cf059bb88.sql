DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='scheduled-reminders-every-minute') THEN
    PERFORM cron.unschedule('scheduled-reminders-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'scheduled-reminders-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/scheduled-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6cmJkYXdscXllYWxubHJ0d2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTA5NDIsImV4cCI6MjA5NDI2Njk0Mn0.uZD07rXDfXt-g3mEMlhS-m_784yaID0-cabPobpMIoE'
    ),
    body := '{}'::jsonb
  );
  $cron$
);
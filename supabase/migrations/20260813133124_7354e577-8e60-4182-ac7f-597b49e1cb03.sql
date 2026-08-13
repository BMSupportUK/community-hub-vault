CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('device-release-watch') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'device-release-watch');

SELECT cron.schedule(
  'device-release-watch',
  '20 4 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/device-release-watch',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6cmJkYXdscXllYWxubHJ0d2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2OTA5NDIsImV4cCI6MjA5NDI2Njk0Mn0.uZD07rXDfXt-g3mEMlhS-m_784yaID0-cabPobpMIoE"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
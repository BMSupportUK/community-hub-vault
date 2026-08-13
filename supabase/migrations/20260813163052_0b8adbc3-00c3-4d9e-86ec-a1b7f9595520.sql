CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('boro-team-sheet') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'boro-team-sheet');

SELECT cron.schedule(
  'boro-team-sheet',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/boro-team-sheet',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $cron$
);
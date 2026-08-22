SELECT cron.unschedule('boro-match-thread')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'boro-match-thread');

SELECT cron.schedule(
  'boro-match-thread',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/boro-match-thread',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('boro-match-events')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'boro-match-events');

SELECT cron.schedule(
  'boro-match-events',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/boro-match-events',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
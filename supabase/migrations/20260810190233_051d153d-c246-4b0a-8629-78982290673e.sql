select cron.schedule(
  'boro-fetch-fixtures-6h',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/boro-fetch-fixtures',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
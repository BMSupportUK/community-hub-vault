DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.unschedule('boro-match-events')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'boro-match-events');
    PERFORM cron.schedule(
      'boro-match-events',
      '* * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/boro-match-events',
          headers := '{"Content-Type": "application/json"}'::jsonb,
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
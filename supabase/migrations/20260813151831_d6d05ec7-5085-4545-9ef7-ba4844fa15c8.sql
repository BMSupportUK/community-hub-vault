ALTER TABLE public.streaming_device_prices REPLICA IDENTITY FULL;
ALTER TABLE public.streaming_devices REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.streaming_device_prices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.streaming_devices;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

SELECT cron.unschedule('refresh-streaming-stock')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-streaming-stock');

SELECT cron.schedule(
  'refresh-streaming-stock',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/refresh-streaming-stock',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
ALTER TABLE public.fan_zone_friendships REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'fan_zone_friendships'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_friendships;
  END IF;
END $$;
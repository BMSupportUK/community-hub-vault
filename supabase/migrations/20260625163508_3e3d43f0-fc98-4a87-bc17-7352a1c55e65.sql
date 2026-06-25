ALTER PUBLICATION supabase_realtime ADD TABLE public.boro_fixtures;
ALTER PUBLICATION supabase_realtime ADD TABLE public.boro_predictions;
ALTER TABLE public.boro_fixtures REPLICA IDENTITY FULL;
ALTER TABLE public.boro_predictions REPLICA IDENTITY FULL;
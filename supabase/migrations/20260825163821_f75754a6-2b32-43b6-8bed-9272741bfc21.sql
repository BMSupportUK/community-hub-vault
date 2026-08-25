ALTER TABLE public.channel_reads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_reads;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_reads TO authenticated;
GRANT ALL ON public.channel_reads TO service_role;
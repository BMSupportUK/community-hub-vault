ALTER FUNCTION public.channel_reads_keep_latest() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.channel_reads_keep_latest() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.channel_reads_keep_latest() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.channel_reads_keep_latest() TO service_role;
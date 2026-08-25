CREATE OR REPLACE FUNCTION public.channel_reads_keep_latest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.last_read_at IS NOT NULL THEN
    NEW.last_read_at := GREATEST(NEW.last_read_at, OLD.last_read_at);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_channel_reads_keep_latest ON public.channel_reads;
CREATE TRIGGER trg_channel_reads_keep_latest
  BEFORE UPDATE ON public.channel_reads
  FOR EACH ROW
  EXECUTE FUNCTION public.channel_reads_keep_latest();

REVOKE ALL ON FUNCTION public.channel_reads_keep_latest() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.channel_reads_keep_latest() TO service_role;
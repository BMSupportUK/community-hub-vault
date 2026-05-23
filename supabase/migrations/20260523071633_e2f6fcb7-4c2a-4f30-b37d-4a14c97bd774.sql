-- Add refresh_notice + auto_clear_at to sports_blogs and schedule body auto-clear
ALTER TABLE public.sports_blogs
  ADD COLUMN IF NOT EXISTS refresh_notice text,
  ADD COLUMN IF NOT EXISTS auto_clear_at timestamptz;

-- Default auto_clear_at to created_at + 24h for new rows if not set
CREATE OR REPLACE FUNCTION public.sports_blogs_set_auto_clear_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.auto_clear_at IS NULL THEN
    NEW.auto_clear_at := COALESCE(NEW.created_at, now()) + interval '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sports_blogs_set_auto_clear_at ON public.sports_blogs;
CREATE TRIGGER sports_blogs_set_auto_clear_at
BEFORE INSERT ON public.sports_blogs
FOR EACH ROW EXECUTE FUNCTION public.sports_blogs_set_auto_clear_at();

-- Backfill existing rows so they auto-clear too
UPDATE public.sports_blogs
   SET auto_clear_at = created_at + interval '24 hours'
 WHERE auto_clear_at IS NULL;

-- Function that clears expired body/excerpt
CREATE OR REPLACE FUNCTION public.sports_blogs_clear_expired()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.sports_blogs
     SET excerpt = NULL, body = NULL
   WHERE auto_clear_at IS NOT NULL
     AND auto_clear_at <= now()
     AND (excerpt IS NOT NULL OR body IS NOT NULL);
$$;

-- Schedule via pg_cron every 15 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('sports-blogs-clear-expired');
EXCEPTION WHEN OTHERS THEN
  -- job didn't exist
  NULL;
END $$;

SELECT cron.schedule(
  'sports-blogs-clear-expired',
  '*/15 * * * *',
  $$ SELECT public.sports_blogs_clear_expired(); $$
);
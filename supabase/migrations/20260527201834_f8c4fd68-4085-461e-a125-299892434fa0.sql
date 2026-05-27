-- Use now() directly so the auto-clear timer doesn't depend on trigger firing order
CREATE OR REPLACE FUNCTION public.sports_blogs_set_auto_clear_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('sports_blogs.skip_auto', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.auto_clear_at := now() + interval '24 hours';
  RETURN NEW;
END;
$$;

-- Heal any rows whose auto_clear_at is already in the past due to the old bug,
-- so they get a fresh 24h window from now rather than being wiped on the next cron.
UPDATE public.sports_blogs
   SET auto_clear_at = now() + interval '24 hours'
 WHERE auto_clear_at IS NOT NULL
   AND auto_clear_at <= now()
   AND body IS NOT NULL;
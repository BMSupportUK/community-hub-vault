
-- Replace trigger so auto_clear_at always tracks updated_at + 24h
CREATE OR REPLACE FUNCTION public.sports_blogs_set_auto_clear_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Always recompute based on updated_at so editing a guide resets the timer.
  NEW.auto_clear_at := COALESCE(NEW.updated_at, now()) + interval '24 hours';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sports_blogs_set_auto_clear_at_trg ON public.sports_blogs;
CREATE TRIGGER sports_blogs_set_auto_clear_at_trg
BEFORE INSERT OR UPDATE ON public.sports_blogs
FOR EACH ROW
EXECUTE FUNCTION public.sports_blogs_set_auto_clear_at();

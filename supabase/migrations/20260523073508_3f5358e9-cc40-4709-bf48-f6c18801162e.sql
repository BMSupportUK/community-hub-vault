
-- Remove duplicate insert-only trigger left over from earlier migration
DROP TRIGGER IF EXISTS sports_blogs_set_auto_clear_at ON public.sports_blogs;

-- Make the updated_at + auto_clear_at triggers skippable via a session flag
CREATE OR REPLACE FUNCTION public.sports_blogs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('sports_blogs.skip_auto', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sports_blogs_set_auto_clear_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('sports_blogs.skip_auto', true) = 'on' THEN
    RETURN NEW;
  END IF;
  NEW.auto_clear_at := COALESCE(NEW.updated_at, now()) + interval '24 hours';
  RETURN NEW;
END;
$$;

-- Auto-clear function: set the session flag so the body wipe does not touch
-- updated_at or auto_clear_at, which would otherwise mark guides as unread.
CREATE OR REPLACE FUNCTION public.sports_blogs_clear_expired()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('sports_blogs.skip_auto', 'on', true);
  UPDATE public.sports_blogs
     SET excerpt = NULL,
         body = NULL
   WHERE auto_clear_at IS NOT NULL
     AND auto_clear_at <= now()
     AND (excerpt IS NOT NULL OR body IS NOT NULL);
  PERFORM set_config('sports_blogs.skip_auto', 'off', true);
END;
$$;

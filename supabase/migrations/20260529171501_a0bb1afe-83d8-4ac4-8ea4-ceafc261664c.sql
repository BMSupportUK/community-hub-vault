CREATE OR REPLACE FUNCTION public.sports_blogs_set_auto_clear_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('sports_blogs.skip_auto', true) = 'on' THEN
    RETURN NEW;
  END IF;
  -- Honor an explicit value supplied by the caller (e.g. computed from the
  -- earliest event time in the body + 6 hours). Otherwise fall back to the
  -- legacy updated_at + 24h safety-net window.
  IF TG_OP = 'UPDATE' AND NEW.auto_clear_at IS DISTINCT FROM OLD.auto_clear_at THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.auto_clear_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW.auto_clear_at := COALESCE(NEW.updated_at, now()) + interval '24 hours';
  RETURN NEW;
END;
$$;
ALTER TYPE public.break_kind ADD VALUE IF NOT EXISTS 'travel';

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.auto_travel_home_breaks()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_shift uuid;
  v_local timestamp;
  v_start timestamptz;
BEGIN
  -- End any travelling-home break that has run for an hour or more.
  UPDATE public.breaks
     SET ended_at = started_at + interval '1 hour'
   WHERE kind = 'travel'
     AND ended_at IS NULL
     AND now() >= started_at + interval '1 hour';

  SELECT id INTO v_user FROM public.profiles WHERE lower(username) = 'danej' LIMIT 1;
  IF v_user IS NULL THEN
    RETURN;
  END IF;

  v_local := (now() AT TIME ZONE 'Europe/London');

  -- Monday..Friday only
  IF extract(isodow FROM v_local) > 5 THEN
    RETURN;
  END IF;

  -- Only within the 16:00 hour window
  IF v_local::time < time '16:00' OR v_local::time >= time '17:00' THEN
    RETURN;
  END IF;

  v_start := (date_trunc('day', v_local) + time '16:00') AT TIME ZONE 'Europe/London';

  -- Needs an open shift to attach to
  SELECT id INTO v_shift
    FROM public.shifts
   WHERE user_id = v_user AND clock_out IS NULL
   ORDER BY clock_in DESC
   LIMIT 1;
  IF v_shift IS NULL THEN
    RETURN;
  END IF;

  -- Already on a break of any kind?
  IF EXISTS (SELECT 1 FROM public.breaks WHERE user_id = v_user AND ended_at IS NULL) THEN
    RETURN;
  END IF;

  -- Already had today's travelling-home break?
  IF EXISTS (
    SELECT 1 FROM public.breaks
     WHERE user_id = v_user
       AND kind = 'travel'
       AND started_at >= v_start
       AND started_at < v_start + interval '1 hour'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.breaks (shift_id, user_id, kind, started_at)
  VALUES (v_shift, v_user, 'travel', greatest(v_start, now() - interval '1 minute'));
END;
$$;

REVOKE ALL ON FUNCTION public.auto_travel_home_breaks() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auto_travel_home_breaks() TO service_role;

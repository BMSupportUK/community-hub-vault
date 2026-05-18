
-- Business hours table: one row per day of week (0 = Sunday .. 6 = Saturday)
CREATE TABLE public.business_hours (
  day_of_week smallint PRIMARY KEY CHECK (day_of_week BETWEEN 0 AND 6),
  is_closed boolean NOT NULL DEFAULT false,
  open_time time NOT NULL DEFAULT '09:00',
  close_time time NOT NULL DEFAULT '17:00',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_hours read approved" ON public.business_hours
FOR SELECT TO authenticated
USING ((NOT has_role(auth.uid(), 'pending'::app_role)) AND (NOT has_role(auth.uid(), 'banned'::app_role)));

CREATE POLICY "business_hours manage admin" ON public.business_hours
FOR ALL TO authenticated
USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]))
WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

-- Seed default 7 rows (Mon-Fri 09-17 open, Sat/Sun closed)
INSERT INTO public.business_hours (day_of_week, is_closed, open_time, close_time) VALUES
  (0, true, '09:00', '17:00'),
  (1, false, '09:00', '17:00'),
  (2, false, '09:00', '17:00'),
  (3, false, '09:00', '17:00'),
  (4, false, '09:00', '17:00'),
  (5, false, '09:00', '17:00'),
  (6, true, '09:00', '17:00');

-- Helper: returns true if "now" in the configured timezone is within business hours.
CREATE OR REPLACE FUNCTION public.is_business_open()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_local timestamptz;
  v_dow smallint;
  v_time time;
  v_row public.business_hours%ROWTYPE;
BEGIN
  SELECT (value->>'tz') INTO v_tz FROM public.app_settings WHERE key = 'timezone';
  IF v_tz IS NULL OR v_tz = '' THEN v_tz := 'Europe/London'; END IF;
  v_dow := EXTRACT(DOW FROM (now() AT TIME ZONE v_tz))::smallint;
  v_time := (now() AT TIME ZONE v_tz)::time;
  SELECT * INTO v_row FROM public.business_hours WHERE day_of_week = v_dow;
  IF NOT FOUND THEN RETURN true; END IF;
  IF v_row.is_closed THEN RETURN false; END IF;
  RETURN v_time >= v_row.open_time AND v_time < v_row.close_time;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_business_open() TO authenticated;

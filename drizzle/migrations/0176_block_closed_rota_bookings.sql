CREATE OR REPLACE FUNCTION public.rota_day_closed(_date date, _now timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$ SELECT _date <= (_now AT TIME ZONE 'Europe/London')::date $$;
REVOKE ALL ON FUNCTION public.rota_day_closed(date,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rota_day_closed(date,timestamptz) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.guard_closed_rota_booking() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND public.rota_day_closed(NEW.shift_date) THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'That rota day is closed — choose a future day' USING ERRCODE = '23514';
    ELSIF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR OLD.shift_date IS DISTINCT FROM NEW.shift_date THEN
      RAISE EXCEPTION 'That rota day is closed — choose a future day' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_closed_rota_booking() FROM PUBLIC;
CREATE TRIGGER guard_closed_rota_booking BEFORE INSERT OR UPDATE OF assigned_to, shift_date ON public.shift_slots FOR EACH ROW EXECUTE FUNCTION public.guard_closed_rota_booking();
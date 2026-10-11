CREATE TABLE public.cover_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  cover_until time NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined')),
  decided_by uuid,
  decided_at timestamptz,
  slot_id uuid,
  shift_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX cover_requests_one_pending ON public.cover_requests(user_id) WHERE status = 'pending';
GRANT SELECT, INSERT ON public.cover_requests TO authenticated;
GRANT ALL ON public.cover_requests TO service_role;
ALTER TABLE public.cover_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own cover requests" ON public.cover_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "Staff request cover" ON public.cover_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending' AND decided_by IS NULL
    AND public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::app_role[]));
ALTER TABLE public.shifts ADD COLUMN cover_request_id uuid;
ALTER TABLE public.shifts ADD COLUMN cover_reason text;
ALTER PUBLICATION supabase_realtime ADD TABLE public.cover_requests;

CREATE OR REPLACE FUNCTION public.decide_cover_request(_id uuid, _approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.cover_requests; uk timestamp; v_slot uuid; v_shift uuid;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management')) THEN
    RAISE EXCEPTION 'Only admin or management can decide cover requests';
  END IF;
  SELECT * INTO r FROM public.cover_requests WHERE id = _id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'Request already handled'; END IF;
  IF NOT _approve THEN
    UPDATE public.cover_requests SET status='declined', decided_by=auth.uid(), decided_at=now() WHERE id=_id;
    RETURN 'declined';
  END IF;
  uk := now() AT TIME ZONE 'Europe/London';
  IF r.cover_until <= uk::time THEN RAISE EXCEPTION 'The requested cover end time has already passed'; END IF;
  INSERT INTO public.shift_slots(shift_date, start_time, end_time, slot_type, assigned_to, notes, created_by)
    VALUES (uk::date, date_trunc('minute', uk)::time, r.cover_until, 'shift', r.user_id, 'Cover: ' || r.reason, auth.uid())
    RETURNING id INTO v_slot;
  SELECT id INTO v_shift FROM public.shifts WHERE user_id = r.user_id AND clock_out IS NULL LIMIT 1;
  IF v_shift IS NULL THEN
    INSERT INTO public.shifts(user_id, cover_request_id, cover_reason) VALUES (r.user_id, r.id, r.reason) RETURNING id INTO v_shift;
  END IF;
  UPDATE public.cover_requests SET status='approved', decided_by=auth.uid(), decided_at=now(), slot_id=v_slot, shift_id=v_shift WHERE id=_id;
  RETURN 'approved';
END $$;
REVOKE EXECUTE ON FUNCTION public.decide_cover_request(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.decide_cover_request(uuid, boolean) TO authenticated;
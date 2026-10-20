-- Only authorized SECURITY DEFINER approval functions may exempt one slot on today's rota.
CREATE OR REPLACE FUNCTION public.guard_closed_rota_booking() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND public.rota_day_closed(NEW.shift_date) THEN
    IF TG_OP = 'INSERT' OR OLD.assigned_to IS DISTINCT FROM NEW.assigned_to OR OLD.shift_date IS DISTINCT FROM NEW.shift_date THEN
      IF NEW.shift_date = (now() AT TIME ZONE 'Europe/London')::date
        AND current_user = pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid = 'public.decide_cover_request(uuid,boolean)'::regprocedure))
        AND public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
        AND current_setting('bm.approved_rota_slot', true) = NEW.id::text THEN
        RETURN NEW;
      END IF;
      RAISE EXCEPTION 'That rota day is closed — choose a future day' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_closed_rota_booking() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.decide_cover_request(_id uuid, _approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.cover_requests; uk timestamp; v_slot uuid; v_shift uuid; previous_slot text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN
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
  v_slot := gen_random_uuid();
  previous_slot := current_setting('bm.approved_rota_slot', true);
  PERFORM set_config('bm.approved_rota_slot', v_slot::text, true);
  INSERT INTO public.shift_slots(id, shift_date, start_time, end_time, slot_type, assigned_to, notes, created_by)
    VALUES (v_slot, uk::date, date_trunc('minute', uk)::time, r.cover_until, 'shift', r.user_id, 'Cover: ' || r.reason, auth.uid());
  PERFORM set_config('bm.approved_rota_slot', COALESCE(previous_slot,''), true);
  SELECT id INTO v_shift FROM public.shifts WHERE user_id = r.user_id AND clock_out IS NULL LIMIT 1;
  IF v_shift IS NULL THEN
    INSERT INTO public.shifts(user_id, cover_request_id, cover_reason) VALUES (r.user_id, r.id, r.reason) RETURNING id INTO v_shift;
  END IF;
  UPDATE public.cover_requests SET status='approved', decided_by=auth.uid(), decided_at=now(), slot_id=v_slot, shift_id=v_shift WHERE id=_id;
  RETURN 'approved';
END;
$$;
REVOKE ALL ON FUNCTION public.decide_cover_request(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_cover_request(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.decide_shift_swap(_id uuid, _approve boolean)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.shift_swap_requests; s public.shift_slots; previous_slot text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN
    RAISE EXCEPTION 'Only admin or management can decide shift swaps';
  END IF;
  SELECT * INTO r FROM public.shift_swap_requests WHERE id=_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'pending' THEN RAISE EXCEPTION 'Request already handled'; END IF;
  IF _approve THEN
    SELECT * INTO s FROM public.shift_slots WHERE id=r.slot_id FOR UPDATE;
    IF s.id IS NULL OR s.assigned_to IS DISTINCT FROM r.requester_id THEN
      RAISE EXCEPTION 'The shift is no longer assigned to the requester';
    END IF;
    IF s.shift_date < (now() AT TIME ZONE 'Europe/London')::date THEN
      RAISE EXCEPTION 'Past shifts cannot be swapped';
    END IF;
    IF r.target_user_id IS NOT NULL AND NOT public.has_any_role(r.target_user_id, ARRAY['admin','management','staff','moderator']::public.app_role[]) THEN
      RAISE EXCEPTION 'The swap target must be a staff member';
    END IF;
    previous_slot := current_setting('bm.approved_rota_slot', true);
    PERFORM set_config('bm.approved_rota_slot', s.id::text, true);
    UPDATE public.shift_slots SET assigned_to=r.target_user_id WHERE id=s.id;
    PERFORM set_config('bm.approved_rota_slot', COALESCE(previous_slot,''), true);
  END IF;
  UPDATE public.shift_swap_requests SET status=CASE WHEN _approve THEN 'approved'::public.request_status ELSE 'denied'::public.request_status END,
    reviewed_by=auth.uid(), reviewed_at=now() WHERE id=_id;
  RETURN CASE WHEN _approve THEN 'approved' ELSE 'denied' END;
END;
$$;
REVOKE ALL ON FUNCTION public.decide_shift_swap(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_shift_swap(uuid,boolean) TO authenticated;

CREATE TABLE public.tv_remote_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  device_token_hash text NOT NULL,
  topic text NOT NULL,
  device_name text NOT NULL DEFAULT 'TV',
  ip_hash text,
  customer_label text,
  staff_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  claimed_at timestamptz,
  consented_at timestamptz,
  ended_at timestamptz,
  ended_by text
);
CREATE UNIQUE INDEX tv_remote_sessions_pending_code ON public.tv_remote_sessions(code_hash) WHERE status = 'pending';
CREATE INDEX tv_remote_sessions_staff ON public.tv_remote_sessions(staff_id, created_at DESC);
GRANT SELECT ON public.tv_remote_sessions TO authenticated;
GRANT ALL ON public.tv_remote_sessions TO service_role;
ALTER TABLE public.tv_remote_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff read own TV sessions, managers read all" ON public.tv_remote_sessions FOR SELECT TO authenticated
USING (staff_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));
REVOKE SELECT (code_hash, device_token_hash, ip_hash) ON public.tv_remote_sessions FROM authenticated;

CREATE TABLE public.tv_remote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  actor_id uuid,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tv_remote_events_actor ON public.tv_remote_events(actor_id, kind, created_at DESC);
GRANT SELECT ON public.tv_remote_events TO authenticated;
GRANT ALL ON public.tv_remote_events TO service_role;
ALTER TABLE public.tv_remote_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Managers read TV remote events" ON public.tv_remote_events FOR SELECT TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE OR REPLACE FUNCTION public.claim_tv_pair_code(_code text, _customer text DEFAULT NULL)
RETURNS TABLE(id uuid, topic text, device_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.tv_remote_sessions;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role]) THEN
    RAISE EXCEPTION 'Only staff can use the TV remote';
  END IF;
  IF (SELECT count(*) FROM public.tv_remote_events e WHERE e.actor_id = auth.uid() AND e.kind = 'claim_failed' AND e.created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Too many wrong codes. Wait 10 minutes and try again';
  END IF;
  SELECT * INTO s FROM public.tv_remote_sessions t
   WHERE t.status = 'pending' AND t.expires_at > now()
     AND t.code_hash = encode(sha256(convert_to(regexp_replace(coalesce(_code,''), '\D', '', 'g'), 'UTF8')), 'hex')
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.tv_remote_events(actor_id, kind) VALUES (auth.uid(), 'claim_failed');
    RAISE EXCEPTION 'That code is wrong or has expired';
  END IF;
  UPDATE public.tv_remote_sessions t SET status = 'claimed', staff_id = auth.uid(), claimed_at = now(),
    customer_label = nullif(left(trim(coalesce(_customer,'')), 80), ''), expires_at = now() + interval '30 minutes'
   WHERE t.id = s.id;
  INSERT INTO public.tv_remote_events(session_id, actor_id, kind) VALUES (s.id, auth.uid(), 'claimed');
  RETURN QUERY SELECT s.id, s.topic, s.device_name;
END $$;

CREATE OR REPLACE FUNCTION public.end_tv_session(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.tv_remote_sessions t SET status = 'ended', ended_at = now(), ended_by = 'staff'
   WHERE t.id = _id AND t.status <> 'ended'
     AND (t.staff_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));
  IF FOUND THEN INSERT INTO public.tv_remote_events(session_id, actor_id, kind) VALUES (_id, auth.uid(), 'ended'); END IF;
END $$;

CREATE OR REPLACE FUNCTION public.touch_tv_session(_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.tv_remote_sessions SET expires_at = now() + interval '30 minutes'
   WHERE id = _id AND staff_id = auth.uid() AND status IN ('claimed','active');
$$;

REVOKE EXECUTE ON FUNCTION public.claim_tv_pair_code(text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.end_tv_session(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.touch_tv_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_tv_pair_code(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_tv_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_tv_session(uuid) TO authenticated;
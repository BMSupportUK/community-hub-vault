DROP POLICY IF EXISTS "Staff read live TV sessions" ON public.tv_remote_sessions;
CREATE POLICY "Staff read live TV sessions" ON public.tv_remote_sessions
  FOR SELECT TO authenticated
  USING (status IN ('pending','claimed','active') AND expires_at > now()
    AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role]));

CREATE OR REPLACE FUNCTION public.answer_tv_request(_id uuid, _link_kind text DEFAULT NULL, _link_id uuid DEFAULT NULL)
 RETURNS TABLE(id uuid, topic text, device_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.tv_remote_sessions;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role]) THEN
    RAISE EXCEPTION 'Only staff can answer TV help requests';
  END IF;
  IF _link_kind IS NOT NULL AND (_link_kind NOT IN ('order','ticket') OR _link_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid link';
  END IF;
  SELECT * INTO s FROM public.tv_remote_sessions t WHERE t.id = _id FOR UPDATE;
  IF NOT FOUND OR s.status <> 'pending' OR s.expires_at <= now() THEN
    RAISE EXCEPTION 'This request has already been answered or has expired';
  END IF;
  UPDATE public.tv_remote_sessions t SET status = 'claimed', staff_id = auth.uid(), claimed_at = now(),
    expires_at = now() + interval '30 minutes', link_kind = _link_kind,
    link_id = CASE WHEN _link_kind IS NULL THEN NULL ELSE _link_id END
   WHERE t.id = s.id;
  INSERT INTO public.tv_remote_events(session_id, actor_id, kind) VALUES (s.id, auth.uid(), 'claimed');
  RETURN QUERY SELECT s.id, s.topic, s.device_name;
END $function$;
REVOKE ALL ON FUNCTION public.answer_tv_request(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.answer_tv_request(uuid, text, uuid) TO authenticated;
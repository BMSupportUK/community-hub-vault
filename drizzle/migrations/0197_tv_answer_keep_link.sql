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
    expires_at = now() + interval '30 minutes',
    link_kind = coalesce(_link_kind, t.link_kind),
    link_id = CASE WHEN _link_kind IS NULL THEN t.link_id ELSE _link_id END
   WHERE t.id = s.id;
  INSERT INTO public.tv_remote_events(session_id, actor_id, kind) VALUES (s.id, auth.uid(), 'claimed');
  RETURN QUERY SELECT t.id, t.topic, t.device_name FROM public.tv_remote_sessions t WHERE t.id = s.id;
END $function$;
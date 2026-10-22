ALTER TABLE public.tv_remote_sessions
  ADD COLUMN IF NOT EXISTS link_kind text CHECK (link_kind IN ('order','ticket')),
  ADD COLUMN IF NOT EXISTS link_id uuid;

DROP POLICY IF EXISTS "Staff read live TV sessions" ON public.tv_remote_sessions;
CREATE POLICY "Staff read live TV sessions" ON public.tv_remote_sessions
  FOR SELECT TO authenticated
  USING (status IN ('claimed','active') AND expires_at > now()
    AND public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role]));

DROP FUNCTION IF EXISTS public.claim_tv_pair_code(text, text);
CREATE FUNCTION public.claim_tv_pair_code(_code text, _customer text DEFAULT NULL, _link_kind text DEFAULT NULL, _link_id uuid DEFAULT NULL)
 RETURNS TABLE(id uuid, topic text, device_name text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.tv_remote_sessions;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role]) THEN
    RAISE EXCEPTION 'Only staff can use the TV remote';
  END IF;
  IF (SELECT count(*) FROM public.tv_remote_events e WHERE e.actor_id = auth.uid() AND e.kind = 'claim_failed' AND e.created_at > now() - interval '10 minutes') >= 10 THEN
    RAISE EXCEPTION 'Too many wrong codes. Wait 10 minutes and try again';
  END IF;
  IF _link_kind IS NOT NULL AND (_link_kind NOT IN ('order','ticket') OR _link_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid link';
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
    customer_label = nullif(left(trim(coalesce(_customer,'')), 80), ''), expires_at = now() + interval '30 minutes',
    link_kind = _link_kind, link_id = CASE WHEN _link_kind IS NULL THEN NULL ELSE _link_id END
   WHERE t.id = s.id;
  INSERT INTO public.tv_remote_events(session_id, actor_id, kind) VALUES (s.id, auth.uid(), 'claimed');
  RETURN QUERY SELECT s.id, s.topic, s.device_name;
END $function$;
GRANT EXECUTE ON FUNCTION public.claim_tv_pair_code(text, text, text, uuid) TO authenticated;
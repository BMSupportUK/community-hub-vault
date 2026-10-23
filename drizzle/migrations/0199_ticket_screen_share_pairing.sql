CREATE OR REPLACE FUNCTION public.ticket_screen_share_state(_ticket_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tickets; s public.tv_remote_sessions; invited boolean;
BEGIN
 SELECT * INTO t FROM public.tickets WHERE id=_ticket_id;
 IF NOT FOUND OR auth.uid() IS NULL OR NOT (t.user_id=auth.uid() OR public.has_any_role(auth.uid(),ARRAY['admin','management']::public.app_role[]) OR (public.has_any_role(auth.uid(),ARRAY['staff']::public.app_role[]) AND public.staff_ticket_scope_allowed(t.category_id,t.order_id))) THEN RAISE EXCEPTION 'Ticket not available'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.ticket_messages m WHERE m.ticket_id=t.id AND m.is_internal=false AND m.content LIKE '%[[screen-share]]%' AND public.has_any_role(m.sender_id,ARRAY['admin','management','staff']::public.app_role[])) INTO invited;
 SELECT * INTO s FROM public.tv_remote_sessions WHERE link_kind='ticket' AND link_id=t.id AND status IN ('pending','claimed','active') AND expires_at>now() ORDER BY requested_at DESC LIMIT 1;
 RETURN jsonb_build_object('invited',invited,'status',s.status);
END $$;
REVOKE ALL ON FUNCTION public.ticket_screen_share_state(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ticket_screen_share_state(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.request_ticket_screen_share(_ticket_id uuid,_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.tickets; s public.tv_remote_sessions; fail_kind text; now_at timestamptz:=now();
BEGIN
 SELECT * INTO t FROM public.tickets WHERE id=_ticket_id FOR UPDATE;
 IF NOT FOUND OR auth.uid() IS NULL OR t.user_id<>auth.uid() THEN RAISE EXCEPTION 'Only the ticket customer can connect their TV'; END IF;
 IF t.status='closed' THEN RAISE EXCEPTION 'This ticket is closed'; END IF;
 IF _code !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Enter the six-digit code on your TV'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.ticket_messages m WHERE m.ticket_id=t.id AND m.is_internal=false AND m.content LIKE '%[[screen-share]]%' AND public.has_any_role(m.sender_id,ARRAY['admin','management','staff']::public.app_role[])) THEN RAISE EXCEPTION 'Wait for staff to request screen sharing'; END IF;
 IF EXISTS(SELECT 1 FROM public.tv_remote_sessions WHERE link_kind='ticket' AND link_id=t.id AND status IN ('pending','claimed','active') AND expires_at>now_at) THEN RAISE EXCEPTION 'A screen share is already in progress for this ticket'; END IF;
 fail_kind:='ticket_code_failed:'||t.id::text;
 IF (SELECT count(*) FROM public.tv_remote_events WHERE actor_id=auth.uid() AND kind=fail_kind AND created_at>now_at-interval '10 minutes')>=8 THEN RAISE EXCEPTION 'Too many wrong codes. Wait ten minutes'; END IF;
 SELECT * INTO s FROM public.tv_remote_sessions WHERE code_hash=encode(sha256(convert_to(_code,'UTF8')),'hex') AND status='pending' AND expires_at>now_at AND link_id IS NULL AND requested_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN
 INSERT INTO public.tv_remote_events(actor_id,kind) VALUES(auth.uid(),fail_kind);
 RETURN NULL;
 END IF;
 UPDATE public.tv_remote_sessions SET link_kind='ticket',link_id=t.id,requested_at=now_at WHERE id=s.id;
 INSERT INTO public.tv_remote_events(session_id,actor_id,kind) VALUES(s.id,auth.uid(),'customer_requested');
 INSERT INTO public.staff_notifications(kind,title,body,link_path,entity_id) VALUES('tv_help','Ticket screen share ready','The customer entered their TV code for ticket: '||t.subject,'/tickets?id='||t.id::text||'&tab=screen',s.id);
 RETURN s.id;
END $$;
REVOKE ALL ON FUNCTION public.request_ticket_screen_share(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.request_ticket_screen_share(uuid,text) TO authenticated,service_role;
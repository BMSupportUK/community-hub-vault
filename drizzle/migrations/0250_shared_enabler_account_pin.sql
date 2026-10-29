CREATE OR REPLACE FUNCTION public.enabler_pin_owner(_pin public.enabler_login_pins) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(_pin.user_id,(SELECT user_id FROM public.tickets WHERE id=_pin.ticket_id),(SELECT user_id FROM private.orders WHERE id=_pin.order_id)) $$;
CREATE OR REPLACE FUNCTION public.active_enabler_login_pin(_scope text,_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid; existing public.enabler_login_pins;
BEGIN
 IF _scope='user_id' THEN owner_id:=_id; ELSIF _scope='ticket_id' THEN SELECT user_id INTO owner_id FROM public.tickets WHERE id=_id; ELSIF _scope='order_id' THEN SELECT user_id INTO owner_id FROM private.orders WHERE id=_id; ELSE RAISE EXCEPTION 'Invalid scope'; END IF;
 SELECT * INTO existing FROM public.enabler_login_pins p WHERE revoked_at IS NULL AND expires_at>clock_timestamp() AND (CASE WHEN owner_id IS NOT NULL THEN public.enabler_pin_owner(p)=owner_id ELSE (_scope='ticket_id' AND ticket_id=_id) OR (_scope='order_id' AND order_id=_id) END) ORDER BY created_at DESC,id LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('expires_at',null,'pin_encrypted',null); END IF;
 RETURN jsonb_build_object('pin_encrypted',existing.pin_encrypted,'expires_at',existing.expires_at);
END $$;
CREATE OR REPLACE FUNCTION public.get_or_create_enabler_login_pin(_scope text,_id uuid,_pin_hash text,_pin_encrypted text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE owner_id uuid; existing jsonb; created public.enabler_login_pins;
BEGIN
 IF _scope NOT IN ('ticket_id','order_id','user_id') OR _id IS NULL THEN RAISE EXCEPTION 'Invalid scope'; END IF;
 IF _scope='user_id' THEN owner_id:=_id; ELSIF _scope='ticket_id' THEN SELECT user_id INTO owner_id FROM public.tickets WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'Unknown ticket'; END IF; ELSE SELECT user_id INTO owner_id FROM private.orders WHERE id=_id; IF NOT FOUND THEN RAISE EXCEPTION 'Unknown order'; END IF; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('enabler-pin:' || CASE WHEN owner_id IS NOT NULL THEN 'user_id:'||owner_id::text ELSE _scope||':'||_id::text END,0));
 existing:=public.active_enabler_login_pin(_scope,_id);
 IF existing->>'expires_at' IS NOT NULL THEN RETURN existing; END IF;
 INSERT INTO public.enabler_login_pins(ticket_id,order_id,user_id,pin_hash,pin_encrypted,expires_at) VALUES(CASE WHEN owner_id IS NULL AND _scope='ticket_id' THEN _id END,CASE WHEN owner_id IS NULL AND _scope='order_id' THEN _id END,owner_id,_pin_hash,_pin_encrypted,clock_timestamp()+interval '24 hours') RETURNING * INTO created;
 RETURN jsonb_build_object('pin_encrypted',created.pin_encrypted,'expires_at',created.expires_at);
END $$;
CREATE OR REPLACE FUNCTION public.revoke_account_enabler_pins(_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('enabler-pin:user_id:'||_user_id::text,0));
 UPDATE public.enabler_login_pins p SET revoked_at=clock_timestamp() WHERE revoked_at IS NULL AND public.enabler_pin_owner(p)=_user_id;
END $$;
REVOKE ALL ON FUNCTION public.enabler_pin_owner(public.enabler_login_pins),public.active_enabler_login_pin(text,uuid),public.get_or_create_enabler_login_pin(text,uuid,text,text),public.revoke_account_enabler_pins(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enabler_pin_owner(public.enabler_login_pins),public.active_enabler_login_pin(text,uuid),public.get_or_create_enabler_login_pin(text,uuid,text,text),public.revoke_account_enabler_pins(uuid) TO service_role;
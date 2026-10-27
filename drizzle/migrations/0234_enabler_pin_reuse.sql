ALTER TABLE public.enabler_login_pins ADD COLUMN pin_encrypted text;
COMMENT ON COLUMN public.enabler_login_pins.pin_encrypted IS 'AES-GCM encrypted display value, accessible only through owner-authorized server functions. Legacy hash-only PINs remain valid until expiry.';
CREATE OR REPLACE FUNCTION public.get_or_create_enabler_login_pin(_scope text, _id uuid, _pin_hash text, _pin_encrypted text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE existing public.enabler_login_pins; created public.enabler_login_pins;
BEGIN
 IF _scope NOT IN ('ticket_id','order_id','user_id') OR _id IS NULL THEN RAISE EXCEPTION 'Invalid scope'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('enabler-pin:' || _scope || ':' || _id::text, 0));
 SELECT * INTO existing FROM public.enabler_login_pins
 WHERE revoked_at IS NULL AND expires_at > clock_timestamp()
 AND ((_scope='ticket_id' AND ticket_id=_id) OR (_scope='order_id' AND order_id=_id) OR (_scope='user_id' AND user_id=_id))
 ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('pin_encrypted',existing.pin_encrypted,'expires_at',existing.expires_at); END IF;
 INSERT INTO public.enabler_login_pins(ticket_id,order_id,user_id,pin_hash,pin_encrypted,expires_at)
 VALUES(CASE WHEN _scope='ticket_id' THEN _id END,CASE WHEN _scope='order_id' THEN _id END,CASE WHEN _scope='user_id' THEN _id END,_pin_hash,_pin_encrypted,clock_timestamp()+interval '24 hours') RETURNING * INTO created;
 RETURN jsonb_build_object('pin_encrypted',created.pin_encrypted,'expires_at',created.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.get_or_create_enabler_login_pin(text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_enabler_login_pin(text,uuid,text,text) TO service_role;
ALTER TABLE public.enabler_login_pins ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'enabler';
ALTER TABLE public.enabler_login_pins ADD CONSTRAINT enabler_login_pins_kind_check CHECK (kind IN ('enabler','direct'));
COMMENT ON COLUMN public.enabler_login_pins.kind IS 'enabler = BM TV Enabler phone/Windows PIN (24h, shared); direct = BM Direct Install PIN (30 min, own system)';
CREATE OR REPLACE FUNCTION public.active_enabler_login_pin(_scope text, _id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE owner_id uuid; existing public.enabler_login_pins;
BEGIN
 IF _scope='user_id' THEN owner_id:=_id; ELSIF _scope='ticket_id' THEN SELECT user_id INTO owner_id FROM public.tickets WHERE id=_id; ELSIF _scope='order_id' THEN SELECT user_id INTO owner_id FROM private.orders WHERE id=_id; ELSE RAISE EXCEPTION 'Invalid scope'; END IF;
 SELECT * INTO existing FROM public.enabler_login_pins p WHERE p.kind='enabler' AND revoked_at IS NULL AND expires_at>clock_timestamp() AND (CASE WHEN owner_id IS NOT NULL THEN public.enabler_pin_owner(p)=owner_id ELSE (_scope='ticket_id' AND ticket_id=_id) OR (_scope='order_id' AND order_id=_id) END) ORDER BY created_at DESC,id LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('expires_at',null,'pin_encrypted',null); END IF;
 RETURN jsonb_build_object('pin_encrypted',existing.pin_encrypted,'expires_at',existing.expires_at);
END $function$;
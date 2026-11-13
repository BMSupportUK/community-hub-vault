DO $patch$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.admin_create_manual_order_v2(text,jsonb,text,text,integer,text,timestamptz)'::regprocedure);
 d:=replace(d,'IF _created_at IS NOT NULL AND _created_at > now() + interval ''5 minutes'' THEN RAISE EXCEPTION ''Order date cannot be in the future''; END IF;','IF _created_at IS NOT NULL AND _created_at > now() + interval ''13 months'' THEN RAISE EXCEPTION ''Order date cannot be more than 13 months ahead''; END IF;');
 EXECUTE d;
 d:=pg_get_functiondef('public.admin_create_manual_order_v5(text,jsonb,text,text,integer,text,timestamptz,uuid,uuid,boolean,uuid)'::regprocedure);
 d:=replace(d,'IF _created_at > now()+interval ''5 minutes'' THEN RAISE EXCEPTION ''Order date cannot be in the future''; END IF;','IF _created_at > now()+interval ''13 months'' THEN RAISE EXCEPTION ''Order date cannot be more than 13 months ahead''; END IF;');
 EXECUTE d;
END $patch$;
CREATE TABLE public.sensitive_gate_sessions (user_id uuid NOT NULL, session_id uuid NOT NULL, gate text NOT NULL CHECK(gate IN ('shop-orders','discounts','player')), unlocked_until timestamptz NOT NULL, PRIMARY KEY(user_id,session_id,gate));
GRANT ALL ON public.sensitive_gate_sessions TO service_role;
ALTER TABLE public.sensitive_gate_sessions ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.sensitive_gate_open(p_gate text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM public.sensitive_gate_sessions WHERE user_id=auth.uid() AND session_id=public.profile_auth_session_id() AND gate=p_gate AND unlocked_until>now()) $$;
REVOKE ALL ON FUNCTION public.sensitive_gate_open(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sensitive_gate_open(text) TO authenticated,service_role;
CREATE POLICY "discount management requires verified unlock" ON public.discount_codes AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.has_role(auth.uid(),'admin') OR public.sensitive_gate_open('discounts')) WITH CHECK (public.sensitive_gate_open('discounts'));
CREATE POLICY "player settings require verified unlock" ON public.player_settings AS RESTRICTIVE FOR ALL TO authenticated USING (public.sensitive_gate_open('player')) WITH CHECK (public.sensitive_gate_open('player'));
CREATE OR REPLACE VIEW public.orders AS
SELECT id,user_id,status::text AS status,total_cents,discount_cents,discount_code,shipping_name,customer_type,existing_username,notes,
CASE WHEN user_id=auth.uid() OR has_any_role(auth.uid(),ARRAY['admin'::app_role,'management'::app_role]) THEN private.app_decrypt(shipping_address_enc) ELSE NULL::text END shipping_address,
CASE WHEN user_id=auth.uid() OR has_any_role(auth.uid(),ARRAY['admin'::app_role,'management'::app_role]) THEN private.app_decrypt(email_enc) ELSE NULL::text END email,
paid_at,paid_by,completed_at,completed_by,created_at,updated_at,wants_adult_content,order_ref,manual_pay_method,credential_id
FROM private.orders
WHERE (auth.uid() IS NULL OR user_id IS DISTINCT FROM auth.uid() OR credential_id IS NULL OR credential_id=public.active_profile_credential())
AND (auth.uid() IS NULL OR user_id=auth.uid() OR NOT public.has_any_role(auth.uid(),ARRAY['admin'::app_role,'management'::app_role]) OR public.sensitive_gate_open('shop-orders'));
CREATE TABLE public.internal_push_auth (id integer PRIMARY KEY CHECK(id=1), secret text NOT NULL);
GRANT ALL ON public.internal_push_auth TO service_role;
ALTER TABLE public.internal_push_auth ENABLE ROW LEVEL SECURITY;
INSERT INTO public.internal_push_auth(id,secret) VALUES(1,encode(extensions.gen_random_bytes(32),'hex'));
CREATE OR REPLACE FUNCTION public.notify_staff_notification_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions AS $$ DECLARE v_secret text; BEGIN SELECT secret INTO v_secret FROM public.internal_push_auth WHERE id=1; PERFORM net.http_post(url:='https://project--5e1fe153-4c10-4ade-8c98-e355fcdea791.lovable.app/api/public/hooks/staff-notification-push',headers:=jsonb_build_object('Content-Type','application/json','x-staff-push-secret',v_secret),body:=jsonb_build_object('id',NEW.id::text)); RETURN NEW; EXCEPTION WHEN OTHERS THEN RETURN NEW; END; $$;
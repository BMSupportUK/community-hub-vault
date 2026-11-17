ALTER TABLE public.vpn_subscriptions ADD COLUMN IF NOT EXISTS paid_until timestamptz;

CREATE TABLE public.vpn_purchases (
  order_id uuid PRIMARY KEY,
  device_id uuid NOT NULL,
  credential_id uuid NOT NULL,
  user_id uuid NOT NULL,
  days integer NOT NULL,
  pence integer NOT NULL,
  paid_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.vpn_purchases TO authenticated;
GRANT ALL ON public.vpn_purchases TO service_role;
ALTER TABLE public.vpn_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vpn purchases admin read" ON public.vpn_purchases FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]));
CREATE INDEX vpn_purchases_device_idx ON public.vpn_purchases(device_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.vpn_on_order_complete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_cred uuid; v_has boolean; v_buy record;
BEGIN
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  -- VPN bought inside BM Player: runs until the subscription end it was priced to.
  IF NEW.customer_type = 'vpn' THEN
    SELECT * INTO v_buy FROM public.vpn_purchases WHERE order_id = NEW.id;
    IF FOUND THEN
      INSERT INTO public.vpn_subscriptions(credential_id, user_id, active, source, order_id, paid_until, updated_at)
      VALUES (v_buy.credential_id, v_buy.user_id, true, 'app', NEW.id, v_buy.paid_until, now())
      ON CONFLICT (credential_id) DO UPDATE SET active = true, source = 'app', order_id = NEW.id, user_id = v_buy.user_id, paid_until = v_buy.paid_until, updated_at = now();
      UPDATE public.vpn_purchases SET completed_at = now() WHERE order_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;
  v_cred := NEW.credential_id;
  IF v_cred IS NULL THEN
    SELECT id INTO v_cred FROM public.app_credentials WHERE owner_id = NEW.user_id ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  END IF;
  IF v_cred IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = NEW.id AND product_name ILIKE 'VPN add-on%') INTO v_has;
  IF v_has THEN
    INSERT INTO public.vpn_subscriptions(credential_id, user_id, active, source, order_id, updated_at)
    VALUES (v_cred, NEW.user_id, true, 'order', NEW.id, now())
    ON CONFLICT (credential_id) DO UPDATE SET active = true, source = 'order', order_id = NEW.id, user_id = NEW.user_id, paid_until = NULL, updated_at = now();
  ELSIF NEW.customer_type = 'existing' THEN
    -- App-bought VPNs end on their own paid-until date; renewals only stop older order-based ones.
    UPDATE public.vpn_subscriptions SET active = false, order_id = NEW.id, updated_at = now() WHERE credential_id = v_cred AND source <> 'app';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.admin_customer_subscriptions'::regproc);
  IF position('<>''vpn''' in d) = 0 THEN
    d := replace(d, 'WHERE o.paid_at IS NOT NULL AND o.status::text<>''cancelled''', 'WHERE o.paid_at IS NOT NULL AND o.status::text<>''cancelled'' AND coalesce(o.customer_type,'''')<>''vpn''');
    EXECUTE d;
  END IF;
END $$;
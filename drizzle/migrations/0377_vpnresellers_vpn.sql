CREATE TABLE public.vpn_subscriptions (
  credential_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'order',
  order_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.vpn_subscriptions TO authenticated;
GRANT ALL ON public.vpn_subscriptions TO service_role;
ALTER TABLE public.vpn_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vpn subs read" ON public.vpn_subscriptions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management') OR user_id = auth.uid());

CREATE TABLE public.vpn_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credential_id uuid NOT NULL,
  user_id uuid NOT NULL,
  device_id uuid UNIQUE,
  vpnr_account_id bigint NOT NULL,
  username text NOT NULL,
  cred_cipher text NOT NULL,
  server_id integer,
  server_name text,
  enabled boolean NOT NULL DEFAULT true,
  remote_active boolean NOT NULL DEFAULT true,
  expire_at date,
  status text,
  status_detail text,
  source text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vpn_accounts_credential_idx ON public.vpn_accounts(credential_id);
GRANT ALL ON public.vpn_accounts TO service_role;
ALTER TABLE public.vpn_accounts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.vpn_on_order_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cred uuid; v_has boolean;
BEGIN
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  v_cred := NEW.credential_id;
  IF v_cred IS NULL THEN
    SELECT id INTO v_cred FROM public.app_credentials WHERE owner_id = NEW.user_id ORDER BY updated_at DESC NULLS LAST LIMIT 1;
  END IF;
  IF v_cred IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = NEW.id AND product_name ILIKE 'VPN add-on%') INTO v_has;
  IF v_has THEN
    INSERT INTO public.vpn_subscriptions(credential_id, user_id, active, source, order_id, updated_at)
    VALUES (v_cred, NEW.user_id, true, 'order', NEW.id, now())
    ON CONFLICT (credential_id) DO UPDATE SET active = true, source = 'order', order_id = NEW.id, user_id = NEW.user_id, updated_at = now();
  ELSIF NEW.customer_type = 'existing' THEN
    UPDATE public.vpn_subscriptions SET active = false, order_id = NEW.id, updated_at = now() WHERE credential_id = v_cred;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.vpn_on_order_complete() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER orders_vpn_on_complete AFTER UPDATE OF completed_at ON private.orders
  FOR EACH ROW EXECUTE FUNCTION public.vpn_on_order_complete();
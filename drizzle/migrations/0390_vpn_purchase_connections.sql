ALTER TABLE public.vpn_purchases ADD COLUMN IF NOT EXISTS connections integer NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.vpn_on_order_complete()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_cred uuid; v_has boolean; v_buy record; v_n int;
BEGIN
  IF NEW.completed_at IS NULL OR OLD.completed_at IS NOT NULL OR NEW.user_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.customer_type = 'vpn' THEN
    SELECT * INTO v_buy FROM public.vpn_purchases WHERE order_id = NEW.id;
    IF FOUND THEN
      v_n := GREATEST(LEAST(COALESCE(v_buy.connections, 1), 3), 1);
      INSERT INTO public.vpn_subscriptions(credential_id, user_id, active, source, order_id, paid_until, slots, updated_at)
      VALUES (v_buy.credential_id, v_buy.user_id, true, 'app', NEW.id, v_buy.paid_until, v_n, now())
      ON CONFLICT (credential_id) DO UPDATE SET
        slots = CASE WHEN vpn_subscriptions.active AND vpn_subscriptions.source = 'app' AND vpn_subscriptions.paid_until > now() THEN LEAST(vpn_subscriptions.slots + v_n, 3) ELSE v_n END,
        paid_until = CASE WHEN vpn_subscriptions.active AND vpn_subscriptions.source = 'app' AND vpn_subscriptions.paid_until > now() THEN LEAST(vpn_subscriptions.paid_until, v_buy.paid_until) ELSE v_buy.paid_until END,
        active = true, source = 'app', order_id = NEW.id, user_id = v_buy.user_id, updated_at = now();
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
    UPDATE public.vpn_subscriptions SET active = false, order_id = NEW.id, updated_at = now() WHERE credential_id = v_cred AND source <> 'app';
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
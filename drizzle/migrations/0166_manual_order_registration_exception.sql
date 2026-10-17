ALTER TABLE public.order_checkout_links ADD COLUMN skip_registration boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.guard_manual_registration_exception() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF (TG_OP='INSERT' AND NEW.skip_registration) OR (TG_OP='UPDATE' AND NEW.skip_registration IS DISTINCT FROM OLD.skip_registration) THEN
  IF NOT COALESCE(public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]),false) THEN RAISE EXCEPTION 'Only admin can change account creation'; END IF;
  IF NEW.claimed_by IS NOT NULL OR NOT EXISTS(SELECT 1 FROM private.orders WHERE id=NEW.order_id AND customer_type='manual') THEN RAISE EXCEPTION 'Only unclaimed manual orders support this option'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_manual_registration_exception BEFORE INSERT OR UPDATE ON public.order_checkout_links FOR EACH ROW EXECUTE FUNCTION public.guard_manual_registration_exception();
CREATE OR REPLACE FUNCTION public.admin_set_manual_registration(p_order_id uuid,p_skip boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
BEGIN
 IF NOT COALESCE(public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]),false) THEN RAISE EXCEPTION 'Only admin can change account creation'; END IF;
 IF p_order_id IS NULL OR p_skip IS NULL THEN RAISE EXCEPTION 'Order and account creation choice are required'; END IF;
 UPDATE public.order_checkout_links SET skip_registration=p_skip WHERE order_id=p_order_id AND claimed_by IS NULL AND EXISTS(SELECT 1 FROM private.orders WHERE id=p_order_id AND customer_type='manual' AND status <> 'cancelled');
 IF NOT FOUND THEN RAISE EXCEPTION 'Manual order not available'; END IF;
 RETURN p_skip;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_manual_registration(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_manual_registration(uuid,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_create_manual_order_v4(_customer_name text,_items jsonb,_method text,_email text DEFAULT NULL,_discount_cents integer DEFAULT 0,_customer_kind text DEFAULT 'new',_created_at timestamptz DEFAULT NULL,_customer_id uuid DEFAULT NULL,_account_id uuid DEFAULT NULL,_skip_registration boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,private AS $$
DECLARE new_id uuid;
BEGIN
 IF NOT COALESCE(public.has_any_role(auth.uid(),ARRAY['admin']::public.app_role[]),false) THEN RAISE EXCEPTION 'Only admin can change account creation'; END IF;
 IF _skip_registration IS NULL THEN RAISE EXCEPTION 'Account creation choice is required'; END IF;
 new_id := public.admin_create_manual_order_v3(_customer_name,_items,_method,_email,_discount_cents,_customer_kind,_created_at,_customer_id,_account_id);
 PERFORM public.admin_set_manual_registration(new_id,_skip_registration);
 RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.admin_create_manual_order_v4(text,jsonb,text,text,integer,text,timestamptz,uuid,uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_create_manual_order_v4(text,jsonb,text,text,integer,text,timestamptz,uuid,uuid,boolean) TO authenticated;
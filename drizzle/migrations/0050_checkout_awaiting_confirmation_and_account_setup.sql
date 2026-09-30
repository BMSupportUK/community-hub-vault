ALTER TABLE public.order_checkout_links
  ADD COLUMN IF NOT EXISTS payment_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_setup_at timestamptz,
  ADD COLUMN IF NOT EXISTS account_setup_by uuid;

CREATE OR REPLACE FUNCTION public.admin_set_account_setup(p_order_id uuid, p_done boolean)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v timestamptz;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.order_checkout_links
     SET account_setup_at = CASE WHEN p_done THEN now() ELSE NULL END,
         account_setup_by = CASE WHEN p_done THEN auth.uid() ELSE NULL END
   WHERE order_id = p_order_id
   RETURNING account_setup_at INTO v;
  IF NOT FOUND THEN RAISE EXCEPTION 'This order has no secure checkout page'; END IF;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.admin_set_account_setup(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_account_setup(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.require_account_setup_before_complete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND OLD.completed_at IS NULL
     AND EXISTS (SELECT 1 FROM public.order_checkout_links l WHERE l.order_id = NEW.id AND l.account_setup_at IS NULL) THEN
    RAISE EXCEPTION 'Confirm the account is set up on the Secure page before completing this sale';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS require_account_setup_before_complete ON private.orders;
CREATE TRIGGER require_account_setup_before_complete
  BEFORE UPDATE OF completed_at ON private.orders
  FOR EACH ROW EXECUTE FUNCTION public.require_account_setup_before_complete();
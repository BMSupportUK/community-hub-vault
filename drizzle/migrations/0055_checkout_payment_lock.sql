ALTER TABLE public.order_checkout_links ADD COLUMN IF NOT EXISTS payment_lock_until timestamptz;

CREATE OR REPLACE FUNCTION public.claim_checkout_payment_lock(p_order uuid, p_seconds int DEFAULT 90)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  UPDATE order_checkout_links SET payment_lock_until = now() + make_interval(secs => p_seconds)
   WHERE order_id = p_order AND (payment_lock_until IS NULL OR payment_lock_until < now());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION public.claim_checkout_payment_lock(uuid,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_checkout_payment_lock(uuid,int) TO service_role;

CREATE OR REPLACE FUNCTION public.release_checkout_payment_lock(p_order uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  UPDATE order_checkout_links SET payment_lock_until = NULL WHERE order_id = p_order;
$$;
REVOKE ALL ON FUNCTION public.release_checkout_payment_lock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_checkout_payment_lock(uuid) TO service_role;
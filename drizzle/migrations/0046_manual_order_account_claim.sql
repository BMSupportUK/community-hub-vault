ALTER TABLE public.order_checkout_links ADD COLUMN IF NOT EXISTS claimed_by uuid;

CREATE OR REPLACE FUNCTION public.claim_checkout_access(p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_link record;
BEGIN
  IF v_uid IS NULL OR coalesce(p_token,'') = '' THEN RETURN false; END IF;
  SELECT l.order_id, l.claimed_by INTO v_link
    FROM public.order_checkout_links l
    JOIN private.orders o ON o.id = l.order_id
   WHERE l.token = p_token AND o.paid_at IS NOT NULL AND o.status <> 'cancelled';
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_link.claimed_by IS NOT NULL AND v_link.claimed_by <> v_uid THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('banned','rejected')) THEN RETURN false; END IF;
  UPDATE public.order_checkout_links SET claimed_by = v_uid WHERE token = p_token;
  UPDATE private.orders SET user_id = v_uid WHERE id = v_link.order_id AND user_id IS NULL;
  DELETE FROM public.user_roles WHERE user_id = v_uid AND role IN ('pending','nonsubscriber');
  INSERT INTO public.user_roles (user_id, role) VALUES (v_uid, 'subscriber') ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.gate_applications SET status = 'approved' WHERE user_id = v_uid AND status = 'pending';
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.claim_checkout_access(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_checkout_access(text) TO authenticated;
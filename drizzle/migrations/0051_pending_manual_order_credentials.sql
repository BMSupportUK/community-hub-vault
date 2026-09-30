CREATE TABLE IF NOT EXISTS private.pending_order_credentials (
  order_id uuid PRIMARY KEY,
  app_login_name text NOT NULL,
  password_enc bytea,
  account_type text NOT NULL DEFAULT 'single',
  expiry_at timestamptz NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.pending_order_credentials FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_stash_order_credential(p_order_id uuid, p_login_name text, p_password text, p_months integer, p_account_type text DEFAULT 'single')
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','extensions','pg_catalog' AS $$
DECLARE v_expiry timestamptz;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF coalesce(btrim(p_login_name),'') = '' OR coalesce(p_password,'') = '' THEN RAISE EXCEPTION 'Login name and password are required'; END IF;
  IF p_months IS NULL OR p_months <= 0 THEN RAISE EXCEPTION 'Invalid term'; END IF;
  v_expiry := now() + make_interval(months => p_months);
  INSERT INTO private.pending_order_credentials (order_id, app_login_name, password_enc, account_type, expiry_at, created_by)
  VALUES (p_order_id, btrim(p_login_name), public.app_encrypt(p_password), coalesce(p_account_type,'single'), v_expiry, auth.uid())
  ON CONFLICT (order_id) DO UPDATE SET app_login_name = EXCLUDED.app_login_name, password_enc = EXCLUDED.password_enc,
    account_type = EXCLUDED.account_type, expiry_at = EXCLUDED.expiry_at, created_by = EXCLUDED.created_by, created_at = now();
  RETURN v_expiry;
END; $$;
REVOKE ALL ON FUNCTION public.staff_stash_order_credential(uuid,text,text,integer,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.staff_stash_order_credential(uuid,text,text,integer,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_checkout_access(p_token text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_link record;
  v_pending record;
  v_number integer;
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
  -- Move login details saved before the customer had an account onto their profile.
  SELECT * INTO v_pending FROM private.pending_order_credentials WHERE order_id = v_link.order_id FOR UPDATE;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));
    SELECT coalesce(max(c.account_number),0)+1 INTO v_number FROM private.app_credentials c WHERE c.owner_id = v_uid;
    INSERT INTO private.app_credentials (id, owner_id, app_login_name, account_type, account_number, password_enc, expiry_at, created_by, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid, v_pending.app_login_name, v_pending.account_type, v_number, v_pending.password_enc, v_pending.expiry_at, v_pending.created_by, now(), now());
    DELETE FROM private.pending_order_credentials WHERE order_id = v_link.order_id;
  END IF;
  RETURN true;
END; $function$;
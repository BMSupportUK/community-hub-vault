ALTER TABLE private.app_credentials ADD COLUMN order_id uuid;
COMMENT ON COLUMN private.app_credentials.order_id IS 'Order this login was entered for (new sale or extension); checkout pages only show rows stamped with their order.';

CREATE OR REPLACE FUNCTION public.staff_create_credential(p_owner_id uuid, p_login_name text, p_password text, p_months integer, p_account_type text DEFAULT 'single'::text, p_order_id uuid DEFAULT NULL)
 RETURNS TABLE(credential_id uuid, account_number integer, expiry_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_id uuid := gen_random_uuid();
  v_number integer;
  v_expiry timestamptz;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF coalesce(btrim(p_login_name), '') = '' OR coalesce(p_password, '') = '' THEN
    RAISE EXCEPTION 'Login name and password are required';
  END IF;
  IF p_months IS NULL OR p_months <= 0 THEN
    RAISE EXCEPTION 'Invalid term';
  END IF;
  IF coalesce(p_account_type,'single') NOT IN ('single','multi','triple') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::text));
  SELECT coalesce(max(c.account_number), 0) + 1 INTO v_number
    FROM private.app_credentials c WHERE c.owner_id = p_owner_id;
  v_expiry := now() + make_interval(months => p_months);
  INSERT INTO private.app_credentials
    (id, owner_id, app_login_name, account_type, account_number, password_enc, expiry_at, created_by, created_at, updated_at, order_id)
  VALUES
    (v_id, p_owner_id, btrim(p_login_name), coalesce(p_account_type,'single'), v_number,
     public.app_encrypt(p_password), v_expiry, auth.uid(), now(), now(), p_order_id);
  RETURN QUERY SELECT v_id, v_number, v_expiry;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_create_credential_with_expiry(p_owner_id uuid, p_login_name text, p_password text, p_expiry timestamp with time zone, p_account_type text DEFAULT 'single'::text, p_order_id uuid DEFAULT NULL)
 RETURNS TABLE(credential_id uuid, account_number integer, expiry_at timestamp with time zone)
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_id uuid := gen_random_uuid();
  v_number integer;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF coalesce(btrim(p_login_name), '') = '' OR coalesce(p_password, '') = '' THEN
    RAISE EXCEPTION 'Login name and password are required';
  END IF;
  IF p_expiry IS NULL THEN
    RAISE EXCEPTION 'Expiry is required';
  END IF;
  IF coalesce(p_account_type,'single') NOT IN ('single','multi','triple') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_owner_id::text));
  SELECT coalesce(max(c.account_number), 0) + 1 INTO v_number
    FROM private.app_credentials c WHERE c.owner_id = p_owner_id;
  INSERT INTO private.app_credentials
    (id, owner_id, app_login_name, account_type, account_number, password_enc, expiry_at, created_by, created_at, updated_at, order_id)
  VALUES
    (v_id, p_owner_id, btrim(p_login_name), coalesce(p_account_type,'single'), v_number,
     public.app_encrypt(p_password), p_expiry, auth.uid(), now(), now(), p_order_id);
  RETURN QUERY SELECT v_id, v_number, p_expiry;
END;
$function$;

CREATE OR REPLACE FUNCTION public.staff_extend_credential(p_credential_id uuid, p_months integer, p_account_type text DEFAULT NULL::text, p_order_id uuid DEFAULT NULL)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_catalog'
AS $function$
DECLARE
  v_current timestamptz;
  v_new timestamptz;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF p_months IS NULL OR p_months <= 0 THEN
    RAISE EXCEPTION 'Invalid term';
  END IF;
  IF p_account_type IS NOT NULL AND p_account_type NOT IN ('single','multi','triple') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;
  SELECT expiry_at INTO v_current FROM private.app_credentials WHERE id = p_credential_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credential not found';
  END IF;
  v_new := greatest(coalesce(v_current, now()), now()) + make_interval(months => p_months);
  UPDATE private.app_credentials
     SET expiry_at = v_new,
         account_type = coalesce(p_account_type, account_type),
         order_id = coalesce(p_order_id, order_id),
         updated_at = now()
   WHERE id = p_credential_id;
  RETURN v_new;
END;
$function$;

-- Claimed checkout: carry the order id across when stashed details move onto the account.
CREATE OR REPLACE FUNCTION public.claim_checkout_access(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'pg_catalog'
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
  SELECT * INTO v_pending FROM private.pending_order_credentials WHERE order_id = v_link.order_id FOR UPDATE;
  IF FOUND THEN
    PERFORM pg_advisory_xact_lock(hashtext(v_uid::text));
    SELECT coalesce(max(c.account_number),0)+1 INTO v_number FROM private.app_credentials c WHERE c.owner_id = v_uid;
    INSERT INTO private.app_credentials (id, owner_id, app_login_name, account_type, account_number, password_enc, expiry_at, created_by, created_at, updated_at, order_id)
    VALUES (gen_random_uuid(), v_uid, v_pending.app_login_name, v_pending.account_type, v_number, v_pending.password_enc, v_pending.expiry_at, v_pending.created_by, now(), now(), v_link.order_id);
    DELETE FROM private.pending_order_credentials WHERE order_id = v_link.order_id;
  END IF;
  RETURN true;
END;
$function$;

-- Checkout page: only the login details staff entered for THIS order (new sale or extension).
CREATE OR REPLACE FUNCTION public.checkout_app_login(p_token text, p_password text)
 RETURNS TABLE(app_login_name text, password text, account_type text, expiry_at timestamp with time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'private', 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_order_id uuid; v_link_pw text; v_claimed uuid; v_setup timestamptz;
  v_user uuid; v_paid timestamptz; v_status text;
begin
  select l.order_id, l.password, l.claimed_by, l.account_setup_at
    into v_order_id, v_link_pw, v_claimed, v_setup
    from public.order_checkout_links l where l.token = p_token limit 1;
  if v_order_id is null then return; end if;
  if v_claimed is null
     and upper(trim(coalesce(p_password, ''))) <> upper(trim(coalesce(v_link_pw, ''))) then
    return;
  end if;
  if v_setup is null then return; end if;
  select o.user_id, o.paid_at, o.status::text
    into v_user, v_paid, v_status
    from private.orders o where o.id = v_order_id;
  if v_user is null or v_paid is null or coalesce(v_status, '') = 'cancelled' then return; end if;

  return query
    select c.app_login_name, private.app_decrypt(c.password_enc), c.account_type, c.expiry_at
      from private.app_credentials c
     where c.owner_id = v_user
       and c.order_id = v_order_id
       and coalesce(c.app_login_name, '') <> ''
       and c.password_enc is not null
     order by c.account_number nulls last;
end;
$function$;
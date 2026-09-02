CREATE OR REPLACE FUNCTION public.staff_extend_credential(
  p_credential_id uuid,
  p_months integer,
  p_account_type text DEFAULT NULL
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_catalog
AS $$
DECLARE
  v_current timestamptz;
  v_new timestamptz;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]) THEN
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
         updated_at = now()
   WHERE id = p_credential_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_extend_credential(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_extend_credential(uuid, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_create_credential(
  p_owner_id uuid,
  p_login_name text,
  p_password text,
  p_months integer,
  p_account_type text DEFAULT 'single'
)
RETURNS TABLE (credential_id uuid, account_number integer, expiry_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions, pg_catalog
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_number integer;
  v_expiry timestamptz;
BEGIN
  IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff']::public.app_role[]) THEN
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
    (id, owner_id, app_login_name, account_type, account_number, password_enc, expiry_at, created_by, created_at, updated_at)
  VALUES
    (v_id, p_owner_id, btrim(p_login_name), coalesce(p_account_type,'single'), v_number,
     public.app_encrypt(p_password), v_expiry, auth.uid(), now(), now());

  RETURN QUERY SELECT v_id, v_number, v_expiry;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_create_credential(uuid, text, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_create_credential(uuid, text, text, integer, text) TO authenticated;
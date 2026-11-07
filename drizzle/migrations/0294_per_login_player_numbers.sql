ALTER TABLE private.app_credentials ADD COLUMN IF NOT EXISTS player_number integer UNIQUE;

CREATE OR REPLACE FUNCTION public.next_free_customer_number()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE n integer;
BEGIN
  LOOP
    n := 100000 + (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 900000)::int;
    CONTINUE WHEN public.customer_number_is_weak(n)
      OR EXISTS (SELECT 1 FROM customer_numbers_retired r WHERE r.number = n)
      OR EXISTS (SELECT 1 FROM customer_numbers c WHERE c.number = n)
      OR EXISTS (SELECT 1 FROM player_offsite_customers o WHERE o.number = n)
      OR EXISTS (SELECT 1 FROM private.app_credentials a WHERE a.player_number = n);
    RETURN n;
  END LOOP;
END $function$;

-- The customer's first login uses their main account number; every further login gets its own.
CREATE OR REPLACE FUNCTION private.assign_login_player_numbers(_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; first_id uuid; n integer;
BEGIN
  IF _owner IS NULL THEN RETURN; END IF;
  SELECT id INTO first_id FROM private.app_credentials WHERE owner_id = _owner ORDER BY account_number NULLS LAST, created_at, id LIMIT 1;
  FOR r IN SELECT id FROM private.app_credentials WHERE owner_id = _owner AND id <> first_id AND player_number IS NULL LOOP
    LOOP
      n := public.next_free_customer_number();
      BEGIN
        UPDATE private.app_credentials SET player_number = n WHERE id = r.id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.app_credentials_player_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM private.assign_login_player_numbers(NEW.owner_id); RETURN NULL; END $$;
DROP TRIGGER IF EXISTS app_credentials_player_number ON private.app_credentials;
CREATE TRIGGER app_credentials_player_number AFTER INSERT OR UPDATE OF owner_id ON private.app_credentials
FOR EACH ROW EXECUTE FUNCTION private.app_credentials_player_number();

-- Number for each login: own number for extra logins, the main number for the first.
CREATE OR REPLACE FUNCTION public.login_player_numbers(_owner uuid)
RETURNS TABLE(credential_id uuid, login text, number integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _owner <> auth.uid() AND NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::public.app_role[]) THEN RETURN; END IF;
  RETURN QUERY SELECT a.id, a.app_login_name, coalesce(a.player_number, (SELECT c.number FROM customer_numbers c WHERE c.user_id = _owner))
    FROM private.app_credentials a WHERE a.owner_id = _owner ORDER BY a.account_number NULLS LAST, a.created_at;
END $$;
REVOKE ALL ON FUNCTION public.login_player_numbers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.login_player_numbers(uuid) TO authenticated;

-- Device unlock: the number that belongs to the login this device uses.
CREATE OR REPLACE FUNCTION public.device_login_player_number(_owner uuid, _login text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT a.player_number FROM private.app_credentials a WHERE a.owner_id = _owner AND lower(btrim(a.app_login_name)) = lower(btrim(_login)) LIMIT 1),
    (SELECT c.number FROM customer_numbers c WHERE c.user_id = _owner))
$$;
REVOKE ALL ON FUNCTION public.device_login_player_number(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_login_player_number(uuid, text) TO service_role;

SELECT private.assign_login_player_numbers(o) FROM (SELECT DISTINCT owner_id o FROM private.app_credentials WHERE owner_id IS NOT NULL) x;
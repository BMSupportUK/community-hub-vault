CREATE OR REPLACE FUNCTION private.assign_login_player_numbers(_owner uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; first_id uuid; main integer; n integer;
BEGIN
  IF _owner IS NULL THEN RETURN; END IF;
  SELECT id INTO first_id FROM private.app_credentials WHERE owner_id = _owner ORDER BY account_number NULLS LAST, created_at, id LIMIT 1;
  SELECT number INTO main FROM customer_numbers WHERE user_id = _owner;
  -- First login keeps the number the customer already knows; it is now stored on that login.
  IF main IS NOT NULL AND NOT EXISTS (SELECT 1 FROM private.app_credentials WHERE player_number = main) THEN
    UPDATE private.app_credentials SET player_number = main WHERE id = first_id AND player_number IS NULL;
  END IF;
  FOR r IN SELECT id FROM private.app_credentials WHERE owner_id = _owner AND player_number IS NULL LOOP
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

CREATE OR REPLACE FUNCTION public.login_player_numbers(_owner uuid)
RETURNS TABLE(credential_id uuid, login text, number integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _owner <> auth.uid() AND NOT public.has_any_role(auth.uid(), ARRAY['admin','management','staff','moderator']::public.app_role[]) THEN RETURN; END IF;
  RETURN QUERY SELECT a.id, a.app_login_name, a.player_number
    FROM private.app_credentials a WHERE a.owner_id = _owner ORDER BY a.account_number NULLS LAST, a.created_at;
END $$;

-- Device unlock: only the number stored on the login this device uses (main number only if the device has no saved login).
CREATE OR REPLACE FUNCTION public.device_login_player_number(_owner uuid, _login text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN EXISTS (SELECT 1 FROM private.app_credentials a WHERE a.owner_id = _owner AND lower(btrim(a.app_login_name)) = lower(btrim(_login)))
    THEN (SELECT a.player_number FROM private.app_credentials a WHERE a.owner_id = _owner AND lower(btrim(a.app_login_name)) = lower(btrim(_login)) LIMIT 1)
    ELSE (SELECT c.number FROM customer_numbers c WHERE c.user_id = _owner) END
$$;

SELECT private.assign_login_player_numbers(o) FROM (SELECT DISTINCT owner_id o FROM private.app_credentials WHERE owner_id IS NOT NULL) x;
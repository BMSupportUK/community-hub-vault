CREATE TABLE public.player_offsite_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name text NOT NULL CHECK (length(btrim(customer_name)) BETWEEN 1 AND 120),
  email text NOT NULL CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  number integer NOT NULL UNIQUE CHECK (number BETWEEN 100000 AND 999999),
  iptv_username text NOT NULL,
  expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.player_offsite_customers IS 'BM Player customers without a website account; numbers share the never-reissued customer number space.';
GRANT SELECT ON public.player_offsite_customers TO authenticated;
GRANT ALL ON public.player_offsite_customers TO service_role;
ALTER TABLE public.player_offsite_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read offsite player customers" ON public.player_offsite_customers FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.player_devices ADD COLUMN offsite_customer_id uuid REFERENCES public.player_offsite_customers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.next_free_customer_number() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  LOOP
    n := 100000 + (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 900000)::int;
    CONTINUE WHEN public.customer_number_is_weak(n)
      OR EXISTS (SELECT 1 FROM customer_numbers_retired r WHERE r.number = n)
      OR EXISTS (SELECT 1 FROM customer_numbers c WHERE c.number = n)
      OR EXISTS (SELECT 1 FROM player_offsite_customers o WHERE o.number = n);
    RETURN n;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.next_free_customer_number() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_customer_number(_user_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; existing integer;
BEGIN
  SELECT number INTO existing FROM customer_numbers WHERE user_id = _user_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  LOOP
    n := public.next_free_customer_number();
    BEGIN
      INSERT INTO customer_numbers(user_id, number) VALUES (_user_id, n);
      RETURN n;
    EXCEPTION WHEN unique_violation THEN
      SELECT number INTO existing FROM customer_numbers WHERE user_id = _user_id;
      IF existing IS NOT NULL THEN RETURN existing; END IF;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.assign_customer_number(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_offsite_player_customer(_name text, _email text, _username text, _expires timestamptz, _admin uuid)
RETURNS TABLE(id uuid, number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; new_id uuid;
BEGIN
  LOOP
    n := public.next_free_customer_number();
    BEGIN
      INSERT INTO player_offsite_customers(customer_name, email, number, iptv_username, expires_at, created_by)
      VALUES (btrim(_name), lower(btrim(_email)), n, btrim(_username), _expires, _admin) RETURNING player_offsite_customers.id INTO new_id;
      id := new_id; number := n; RETURN NEXT; RETURN;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.issue_offsite_player_customer(text, text, text, timestamptz, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_offsite_player_customer(text, text, text, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_free_customer_number() TO service_role;
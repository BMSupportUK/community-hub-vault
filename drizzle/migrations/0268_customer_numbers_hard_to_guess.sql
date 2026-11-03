CREATE OR REPLACE FUNCTION public.customer_number_is_weak(n integer) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE s text := n::text; d int[]; i int;
BEGIN
  FOR i IN 1..6 LOOP d[i] := substr(s, i, 1)::int; END LOOP;
  -- fewer than 4 different digits (111111, 112233, 121212, 123123 ...)
  IF (SELECT count(DISTINCT x) FROM unnest(d) x) < 4 THEN RETURN true; END IF;
  -- mirrored (123321)
  IF s = reverse(s) THEN RETURN true; END IF;
  FOR i IN 1..4 LOOP
    -- three of the same in a row, or three counting up/down (123, 987)
    IF d[i] = d[i+1] AND d[i+1] = d[i+2] THEN RETURN true; END IF;
    IF d[i+1] - d[i] = 1 AND d[i+2] - d[i+1] = 1 THEN RETURN true; END IF;
    IF d[i] - d[i+1] = 1 AND d[i+1] - d[i+2] = 1 THEN RETURN true; END IF;
  END LOOP;
  -- any digit appearing three or more times
  IF EXISTS (SELECT 1 FROM unnest(d) x GROUP BY x HAVING count(*) >= 3) THEN RETURN true; END IF;
  RETURN false;
END $$;

ALTER TABLE public.customer_numbers ADD CONSTRAINT customer_numbers_not_simple CHECK (NOT public.customer_number_is_weak(number)) NOT VALID;

CREATE OR REPLACE FUNCTION public.assign_customer_number(_user_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; existing integer;
BEGIN
  SELECT number INTO existing FROM customer_numbers WHERE user_id = _user_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  LOOP
    n := 100000 + (('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 900000)::int;
    CONTINUE WHEN public.customer_number_is_weak(n);
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
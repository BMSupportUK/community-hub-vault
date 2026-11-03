CREATE TABLE public.customer_numbers_retired (
  number integer PRIMARY KEY,
  retired_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.customer_numbers_retired IS 'Numbers withdrawn before use; never issued again.';
GRANT ALL ON public.customer_numbers_retired TO service_role;
ALTER TABLE public.customer_numbers_retired ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.assign_customer_number(_user_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; existing integer;
BEGIN
  SELECT number INTO existing FROM customer_numbers WHERE user_id = _user_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  LOOP
    n := 100000 + (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 900000)::int;
    CONTINUE WHEN public.customer_number_is_weak(n)
      OR EXISTS (SELECT 1 FROM customer_numbers_retired r WHERE r.number = n);
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

-- Swap out the simple numbers issued earlier today (not yet used by any app), keeping them reserved forever.
CREATE TEMP TABLE weak_cn ON COMMIT DROP AS
  SELECT user_id, number FROM public.customer_numbers WHERE public.customer_number_is_weak(number);
INSERT INTO public.customer_numbers_retired(number) SELECT number FROM weak_cn;
ALTER TABLE public.customer_numbers DISABLE TRIGGER customer_numbers_permanent;
DELETE FROM public.customer_numbers c USING weak_cn w WHERE c.user_id = w.user_id;
ALTER TABLE public.customer_numbers ENABLE TRIGGER customer_numbers_permanent;
SELECT public.assign_customer_number(user_id) FROM weak_cn;
ALTER TABLE public.customer_numbers VALIDATE CONSTRAINT customer_numbers_not_simple;
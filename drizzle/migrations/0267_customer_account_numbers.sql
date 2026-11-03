CREATE TABLE public.customer_numbers (
  user_id uuid PRIMARY KEY,
  number integer NOT NULL UNIQUE CHECK (number BETWEEN 100000 AND 999999),
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.customer_numbers IS 'Permanent 6-digit account numbers. Rows are never deleted so a number can never be issued twice.';
GRANT ALL ON public.customer_numbers TO service_role;
ALTER TABLE public.customer_numbers ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.block_customer_number_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Account numbers are permanent'; END $$;
CREATE TRIGGER customer_numbers_permanent BEFORE UPDATE OR DELETE ON public.customer_numbers
FOR EACH ROW EXECUTE FUNCTION public.block_customer_number_change();

CREATE OR REPLACE FUNCTION public.assign_customer_number(_user_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; existing integer;
BEGIN
  SELECT number INTO existing FROM customer_numbers WHERE user_id = _user_id;
  IF existing IS NOT NULL THEN RETURN existing; END IF;
  LOOP
    n := 100000 + floor(random() * 900000)::int;
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

CREATE OR REPLACE FUNCTION public.profiles_assign_customer_number() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.assign_customer_number(NEW.id); RETURN NEW; END $$;
CREATE TRIGGER profiles_customer_number AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_assign_customer_number();

SELECT public.assign_customer_number(id) FROM public.profiles;

-- Own number, or any number for admin/management/staff/moderator.
CREATE OR REPLACE FUNCTION public.get_customer_number(p_user_id uuid) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  IF p_user_id <> auth.uid() AND NOT (
    has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management') OR has_role(auth.uid(),'staff') OR has_role(auth.uid(),'moderator')
  ) THEN RETURN NULL; END IF;
  RETURN (SELECT number FROM customer_numbers WHERE user_id = p_user_id);
END $$;
REVOKE ALL ON FUNCTION public.get_customer_number(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_number(uuid) TO authenticated;

ALTER TABLE public.player_devices
  ADD COLUMN unlock_failures integer NOT NULL DEFAULT 0,
  ADD COLUMN unlock_locked_until timestamptz;
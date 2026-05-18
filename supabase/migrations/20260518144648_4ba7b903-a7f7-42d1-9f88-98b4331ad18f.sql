DROP TRIGGER IF EXISTS orders_iud ON public.orders;

DROP VIEW IF EXISTS public.orders;

CREATE VIEW public.orders WITH (security_invoker = true) AS
SELECT
  id,
  user_id,
  status::text AS status,
  total_cents,
  discount_cents,
  discount_code,
  shipping_name,
  customer_type,
  existing_username,
  notes,
  CASE
    WHEN user_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
    THEN private.app_decrypt(shipping_address_enc)
    ELSE NULL::text
  END AS shipping_address,
  CASE
    WHEN user_id = auth.uid()
      OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
    THEN private.app_decrypt(email_enc)
    ELSE NULL::text
  END AS email,
  paid_at,
  paid_by,
  completed_at,
  completed_by,
  created_at,
  updated_at,
  wants_adult_content
FROM private.orders;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;

CREATE OR REPLACE FUNCTION public.tg_orders_iud()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_id uuid;
  v_status_text text;
  v_status public.order_status;
  v_paid_at timestamptz;
BEGIN
  v_status_text := lower(coalesce(NEW.status, 'pending'));
  v_status := CASE
    WHEN v_status_text = 'paid' THEN 'processing'::public.order_status
    WHEN v_status_text IN ('pending', 'processing', 'shipped', 'completed', 'cancelled') THEN v_status_text::public.order_status
    ELSE 'pending'::public.order_status
  END;
  v_paid_at := CASE WHEN v_status_text = 'paid' THEN coalesce(NEW.paid_at, now()) ELSE NEW.paid_at END;

  IF (TG_OP = 'INSERT') THEN
    IF NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    v_id := coalesce(NEW.id, gen_random_uuid());
    INSERT INTO private.orders
      (id, user_id, status, total_cents, discount_cents, discount_code, shipping_name,
       customer_type, existing_username, notes, wants_adult_content, shipping_address_enc, email_enc,
       paid_at, paid_by, completed_at, completed_by, created_at, updated_at)
    VALUES
      (v_id, NEW.user_id, v_status,
       coalesce(NEW.total_cents, 0), coalesce(NEW.discount_cents, 0), NEW.discount_code,
       NEW.shipping_name, NEW.customer_type, NEW.existing_username, NEW.notes, NEW.wants_adult_content,
       public.app_encrypt(NEW.shipping_address), public.app_encrypt(NEW.email),
       v_paid_at, NEW.paid_by, NEW.completed_at, NEW.completed_by,
       coalesce(NEW.created_at, now()), now());

    NEW.id := v_id;
    NEW.status := v_status::text;
    NEW.paid_at := v_paid_at;
    NEW.created_at := coalesce(NEW.created_at, now());
    NEW.updated_at := now();
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    IF NOT (OLD.user_id = auth.uid()
            OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    UPDATE private.orders SET
      status = v_status,
      total_cents = NEW.total_cents,
      discount_cents = NEW.discount_cents,
      discount_code = NEW.discount_code,
      shipping_name = NEW.shipping_name,
      customer_type = NEW.customer_type,
      existing_username = NEW.existing_username,
      notes = NEW.notes,
      wants_adult_content = NEW.wants_adult_content,
      shipping_address_enc = CASE WHEN NEW.shipping_address IS DISTINCT FROM OLD.shipping_address
                                  THEN public.app_encrypt(NEW.shipping_address) ELSE shipping_address_enc END,
      email_enc = CASE WHEN NEW.email IS DISTINCT FROM OLD.email
                       THEN public.app_encrypt(NEW.email) ELSE email_enc END,
      paid_at = v_paid_at,
      paid_by = NEW.paid_by,
      completed_at = NEW.completed_at,
      completed_by = NEW.completed_by,
      updated_at = now()
    WHERE id = OLD.id;

    NEW.status := v_status::text;
    NEW.paid_at := v_paid_at;
    NEW.updated_at := now();
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    IF NOT public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[]) THEN
      RAISE EXCEPTION 'Not authorized';
    END IF;

    DELETE FROM private.orders WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER orders_iud
INSTEAD OF INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.tg_orders_iud();
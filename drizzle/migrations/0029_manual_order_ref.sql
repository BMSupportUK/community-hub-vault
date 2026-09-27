ALTER TABLE private.orders ADD COLUMN IF NOT EXISTS order_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_ref_key ON private.orders(order_ref) WHERE order_ref IS NOT NULL;
CREATE SEQUENCE IF NOT EXISTS private.manual_order_ref_seq;

CREATE OR REPLACE FUNCTION private.set_manual_order_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
BEGIN
  IF NEW.customer_type = 'manual' AND NEW.order_ref IS NULL THEN
    NEW.order_ref := 'MANUAL-' || to_char(coalesce(NEW.created_at, now()), 'YYYYMM') || '-' || lpad(nextval('private.manual_order_ref_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_manual_order_ref ON private.orders;
CREATE TRIGGER trg_set_manual_order_ref BEFORE INSERT ON private.orders
FOR EACH ROW EXECUTE FUNCTION private.set_manual_order_ref();

UPDATE private.orders SET order_ref = 'MANUAL-' || to_char(created_at, 'YYYYMM') || '-' || lpad(nextval('private.manual_order_ref_seq')::text, 4, '0')
WHERE customer_type = 'manual' AND order_ref IS NULL;

CREATE OR REPLACE VIEW public.orders WITH (security_invoker = true) AS
 SELECT id, user_id, (status)::text AS status, total_cents, discount_cents, discount_code, shipping_name, customer_type, existing_username, notes,
    CASE WHEN ((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])) THEN private.app_decrypt(shipping_address_enc) ELSE NULL::text END AS shipping_address,
    CASE WHEN ((user_id = auth.uid()) OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role])) THEN private.app_decrypt(email_enc) ELSE NULL::text END AS email,
    paid_at, paid_by, completed_at, completed_by, created_at, updated_at, wants_adult_content, order_ref
   FROM private.orders;
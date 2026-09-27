CREATE OR REPLACE FUNCTION private.set_manual_order_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
BEGIN
  IF NEW.customer_type = 'manual' AND NEW.order_ref IS NULL THEN
    NEW.order_ref := 'MANUAL-' || lpad(nextval('private.manual_order_ref_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;
UPDATE private.orders SET order_ref = 'MANUAL-' || split_part(order_ref, '-', 3)
WHERE customer_type = 'manual' AND order_ref LIKE 'MANUAL-______-%';
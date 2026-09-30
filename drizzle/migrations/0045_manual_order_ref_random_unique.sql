CREATE OR REPLACE FUNCTION private.set_manual_order_ref()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = private, public AS $$
DECLARE
  _ref text;
BEGIN
  IF NEW.customer_type = 'manual' AND NEW.order_ref IS NULL THEN
    LOOP
      _ref := 'MANUAL-' || lpad(floor(random() * 1000000)::text, 6, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM private.orders WHERE order_ref = _ref);
    END LOOP;
    NEW.order_ref := _ref;
  END IF;
  RETURN NEW;
END $$;

COMMENT ON FUNCTION private.set_manual_order_ref() IS 'Assigns each manual order a random, never-reused MANUAL-NNNNNN reference (replaces sequential counter).';
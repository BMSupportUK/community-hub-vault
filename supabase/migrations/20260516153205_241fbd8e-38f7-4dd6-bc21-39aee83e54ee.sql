CREATE OR REPLACE FUNCTION public.validate_restricted_discount_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_discount_code text;
  v_discount_id uuid;
  v_restricted_count integer;
BEGIN
  SELECT o.discount_code INTO v_discount_code
  FROM private.orders o
  WHERE o.id = NEW.order_id;

  IF v_discount_code IS NULL OR btrim(v_discount_code) = '' THEN
    RETURN NEW;
  END IF;

  SELECT dc.id INTO v_discount_id
  FROM public.discount_codes dc
  WHERE lower(dc.code) = lower(v_discount_code)
    AND dc.is_active = true
  LIMIT 1;

  IF v_discount_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_restricted_count
  FROM public.discount_code_products dcp
  WHERE dcp.discount_code_id = v_discount_id;

  IF v_restricted_count = 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.product_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.discount_code_products dcp
    WHERE dcp.discount_code_id = v_discount_id
      AND dcp.product_id = NEW.product_id
  ) THEN
    RAISE EXCEPTION 'This discount code cannot be used with one or more products in the order';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_restricted_discount_order_item ON public.order_items;
CREATE TRIGGER validate_restricted_discount_order_item
BEFORE INSERT OR UPDATE ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.validate_restricted_discount_order_item();
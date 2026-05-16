CREATE OR REPLACE FUNCTION private.prevent_completed_order_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF OLD.status = 'completed' OR OLD.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order is completed and cannot be modified';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_completed_order_changes ON private.orders;
CREATE TRIGGER trg_prevent_completed_order_changes
BEFORE UPDATE ON private.orders
FOR EACH ROW
EXECUTE FUNCTION private.prevent_completed_order_changes();
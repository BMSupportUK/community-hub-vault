
-- Trigger function: when an order becomes paid, mark any non-finished
-- NOWPayments invoice row as 'superseded' so admins can tell it's dead.
CREATE OR REPLACE FUNCTION public.supersede_stale_crypto_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.paid_at IS NOT NULL AND (OLD.paid_at IS NULL OR OLD.paid_at IS DISTINCT FROM NEW.paid_at) THEN
    UPDATE public.order_payments
       SET status = 'superseded', updated_at = now()
     WHERE order_id = NEW.id
       AND provider = 'nowpayments'
       AND status NOT IN ('finished', 'superseded');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_supersede_stale_crypto_invoice ON private.orders;
CREATE TRIGGER trg_supersede_stale_crypto_invoice
AFTER UPDATE OF paid_at ON private.orders
FOR EACH ROW
EXECUTE FUNCTION public.supersede_stale_crypto_invoice();

-- One-shot cleanup: any existing nowpayments rows that aren't finished but
-- whose order is already paid via another provider get marked superseded.
UPDATE public.order_payments op
   SET status = 'superseded', updated_at = now()
  FROM private.orders o
 WHERE op.order_id = o.id
   AND op.provider = 'nowpayments'
   AND op.status NOT IN ('finished', 'superseded')
   AND o.paid_at IS NOT NULL;

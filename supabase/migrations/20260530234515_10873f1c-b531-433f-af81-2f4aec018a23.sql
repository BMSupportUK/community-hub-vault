CREATE UNIQUE INDEX IF NOT EXISTS order_payments_provider_payment_id_unique
ON public.order_payments (provider, provider_payment_id)
WHERE provider_payment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prevent_completed_order_payment_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('COMPLETED', 'completed', 'finished')
       AND (
         NEW.provider IS DISTINCT FROM OLD.provider OR
         NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id OR
         NEW.square_payment_id IS DISTINCT FROM OLD.square_payment_id OR
         NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR
         NEW.currency IS DISTINCT FROM OLD.currency OR
         NEW.status IS DISTINCT FROM OLD.status
       ) THEN
      RAISE EXCEPTION 'Completed payment records cannot be replaced';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_completed_order_payment_changes ON public.order_payments;
CREATE TRIGGER prevent_completed_order_payment_changes
BEFORE UPDATE ON public.order_payments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_completed_order_payment_changes();
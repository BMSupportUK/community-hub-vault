CREATE OR REPLACE FUNCTION public.prevent_completed_order_payment_changes()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IN ('COMPLETED', 'completed', 'finished')
       AND (
         NEW.provider IS DISTINCT FROM OLD.provider OR
         (current_setting('app.payment_reference_fix', true) IS DISTINCT FROM 'on' AND (
           NEW.provider_payment_id IS DISTINCT FROM OLD.provider_payment_id OR
           NEW.square_payment_id IS DISTINCT FROM OLD.square_payment_id)) OR
         NEW.amount_cents IS DISTINCT FROM OLD.amount_cents OR
         NEW.currency IS DISTINCT FROM OLD.currency OR
         NEW.status IS DISTINCT FROM OLD.status
       ) THEN
      RAISE EXCEPTION 'Completed payment records cannot be replaced';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_correct_payment_reference(_order_id uuid, _reference text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF NOT public.has_any_role(auth.uid(), array['admin','management']::app_role[]) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF coalesce(btrim(_reference), '') = '' OR length(_reference) > 200 THEN
    RAISE EXCEPTION 'Enter a payment reference';
  END IF;
  PERFORM set_config('app.payment_reference_fix', 'on', true);
  -- Clearing the fee lets the automatic fee check fetch it for the corrected reference.
  UPDATE public.order_payments
     SET provider_payment_id = btrim(_reference),
         square_payment_id = CASE WHEN square_payment_id IS NULL THEN NULL ELSE btrim(_reference) END,
         provider_fee_cents = NULL
   WHERE order_id = _order_id AND provider IN ('square','stripe');
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.payment_reference_fix', 'off', true);
  IF n <> 1 THEN RAISE EXCEPTION 'Expected exactly one Square or Stripe payment on this order'; END IF;
  RETURN n;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_correct_payment_reference(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_payment_reference(uuid, text) TO authenticated;
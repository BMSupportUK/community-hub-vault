CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid, p_transaction_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_updated private.orders%ROWTYPE;
  v_txn text;
  v_payment public.order_payments%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['admin','management']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  v_txn := NULLIF(btrim(p_transaction_id), '');
  IF v_txn IS NULL THEN
    RAISE EXCEPTION 'Transaction ID is required';
  END IF;

  SELECT * INTO v_payment
  FROM public.order_payments
  WHERE provider_payment_id = v_txn OR square_payment_id = v_txn
  LIMIT 1;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Transaction ID not found in payment records';
  END IF;

  IF v_payment.order_id <> p_order_id THEN
    RAISE EXCEPTION 'Transaction ID belongs to a different order';
  END IF;

  UPDATE private.orders
  SET status = CASE
        WHEN status = 'pending'::public.order_status THEN 'processing'::public.order_status
        ELSE status
      END,
      paid_at = COALESCE(paid_at, now()),
      paid_by = COALESCE(paid_by, v_uid),
      updated_at = now()
  WHERE id = p_order_id
    AND completed_at IS NULL
  RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RAISE EXCEPTION 'Order not found or already completed';
  END IF;

  INSERT INTO public.order_messages (order_id, sender_id, content)
  VALUES (p_order_id, v_uid, '💳 Payment received — thank you for your payment! (Txn: ' || v_txn || ')');

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_updated.id,
    'status', v_updated.status::text,
    'paid_at', v_updated.paid_at,
    'transaction_id', v_txn
  );
END;
$function$;
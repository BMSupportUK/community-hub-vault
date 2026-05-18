CREATE OR REPLACE FUNCTION public.mark_order_paid(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated private.orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_role(v_uid, ARRAY['admin','management']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
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
  VALUES (p_order_id, v_uid, '💳 Payment received — thank you for your payment!');

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', v_updated.id,
    'status', v_updated.status::text,
    'paid_at', v_updated.paid_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_order_paid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_order_paid(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
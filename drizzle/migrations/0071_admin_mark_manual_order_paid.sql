CREATE OR REPLACE FUNCTION public.admin_mark_manual_order_paid(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_existing private.orders%ROWTYPE;
  v_updated private.orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_any_role(v_uid, ARRAY['admin','management']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_existing FROM private.orders WHERE id = p_order_id;
  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_existing.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This order is already completed';
  END IF;
  -- Already paid: treat as success so a second tap never errors.
  IF v_existing.paid_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'order_id', v_existing.id, 'status', v_existing.status::text, 'paid_at', v_existing.paid_at, 'already_paid', true);
  END IF;

  UPDATE private.orders
  SET status = CASE WHEN status = 'pending'::public.order_status THEN 'processing'::public.order_status ELSE status END,
      paid_at = now(),
      paid_by = v_uid,
      updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_updated;

  INSERT INTO public.order_messages (order_id, sender_id, content)
  VALUES (p_order_id, v_uid, '💳 Payment received — thank you for your payment!');

  RETURN jsonb_build_object('ok', true, 'order_id', v_updated.id, 'status', v_updated.status::text, 'paid_at', v_updated.paid_at, 'already_paid', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_mark_manual_order_paid(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_manual_order_paid(uuid) TO authenticated, service_role;

-- The one-argument overload made every one-argument call ambiguous
-- ("Could not choose the best candidate function"). Remove it.
DROP FUNCTION IF EXISTS public.mark_order_paid(uuid);
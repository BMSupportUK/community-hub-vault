CREATE OR REPLACE FUNCTION public.handle_invoice_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_order_user uuid;
  v_order_total integer;
BEGIN
  IF NEW.status = 'PAID' AND (OLD.status IS DISTINCT FROM 'PAID') THEN
    UPDATE private.orders
      SET status = CASE
            WHEN status = 'pending' THEN 'processing'::order_status
            ELSE status
          END,
          paid_at = COALESCE(paid_at, now()),
          updated_at = now()
      WHERE id = NEW.order_id AND completed_at IS NULL
      RETURNING user_id, total_cents INTO v_order_user, v_order_total;

    INSERT INTO public.order_messages (order_id, sender_id, content, is_system)
    VALUES (NEW.order_id, NULL,
            '✅ Invoice paid via Square' ||
            CASE WHEN NEW.invoice_number IS NOT NULL THEN ' (#' || NEW.invoice_number || ')' ELSE '' END,
            true);

    INSERT INTO public.staff_notifications (kind, title, body, link, metadata)
    VALUES ('invoice_paid', 'Invoice paid',
            'Order #' || substring(NEW.order_id::text, 1, 8) || ' has been paid via Square.',
            '/shop?view=orders&id=' || NEW.order_id::text,
            jsonb_build_object('order_id', NEW.order_id, 'invoice_number', NEW.invoice_number));

    NEW.paid_at := COALESCE(NEW.paid_at, now());
  END IF;
  RETURN NEW;
END;
$$;
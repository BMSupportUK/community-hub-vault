CREATE OR REPLACE FUNCTION public.handle_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_order_user uuid;
  v_sender uuid;
BEGIN
  IF upper(COALESCE(NEW.status, '')) = 'PAID'
     AND upper(COALESCE(OLD.status, '')) IS DISTINCT FROM 'PAID' THEN
    UPDATE private.orders
      SET status = CASE
            WHEN status = 'pending'::public.order_status THEN 'processing'::public.order_status
            ELSE status
          END,
          paid_at = COALESCE(paid_at, now()),
          paid_by = COALESCE(paid_by, NEW.created_by),
          updated_at = now()
      WHERE id = NEW.order_id
        AND completed_at IS NULL
      RETURNING user_id INTO v_order_user;

    SELECT COALESCE(NEW.created_by, v_order_user) INTO v_sender;

    IF v_sender IS NOT NULL THEN
      INSERT INTO public.order_messages (order_id, sender_id, content)
      VALUES (
        NEW.order_id,
        v_sender,
        '✅ Invoice paid via Square' ||
        CASE WHEN NEW.invoice_number IS NOT NULL THEN ' (#' || NEW.invoice_number || ')' ELSE '' END
      );
    END IF;

    INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
    VALUES (
      'invoice_paid',
      'Invoice paid',
      'Order #' || substring(NEW.order_id::text, 1, 8) || ' has been paid via Square.',
      '/shop?view=orders&id=' || NEW.order_id::text,
      NEW.order_id
    );

    NEW.paid_at := COALESCE(NEW.paid_at, now());
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
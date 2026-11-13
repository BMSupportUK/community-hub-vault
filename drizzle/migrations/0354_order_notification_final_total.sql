CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uname text;
  csym text;
  saved_order private.orders%ROWTYPE;
BEGIN
  -- Deferred insertion notifications must read the completed transaction, not NEW's initial zero total.
  SELECT * INTO saved_order FROM private.orders WHERE id = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT COALESCE(value->>'symbol', '£') INTO csym FROM public.app_settings WHERE key = 'currency';
  csym := COALESCE(csym, '£');
  IF saved_order.customer_type = 'manual' THEN
    SELECT COALESCE(display_name, username, 'An admin') INTO uname FROM public.profiles WHERE id = saved_order.user_id;
    INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
    VALUES ('order_placed', 'Manual order',
      COALESCE(uname, 'An admin') || ' added a manual order for ' || COALESCE(NULLIF(trim(saved_order.shipping_name), ''), 'a customer')
        || ' (' || csym || (saved_order.total_cents/100.0)::numeric(10,2) || ')',
      '/admin-secure-page?order=' || saved_order.id::text, saved_order.id);
    RETURN NEW;
  END IF;
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = saved_order.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('order_placed', 'New order', COALESCE(uname, 'A customer') || ' placed an order (' || csym || (saved_order.total_cents/100.0)::numeric(10,2) || ')',
    '/admin-secure-page?order=' || saved_order.id::text, saved_order.id);
  RETURN NEW;
END;
$function$;
DROP TRIGGER trg_notify_new_order ON private.orders;
CREATE CONSTRAINT TRIGGER trg_notify_new_order
AFTER INSERT ON private.orders DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();
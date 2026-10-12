CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
  csym TEXT;
BEGIN
  SELECT COALESCE(value->>'symbol', '£') INTO csym FROM public.app_settings WHERE key = 'currency';
  IF NEW.customer_type = 'manual' THEN
    -- Manual orders are keyed in by an admin for a customer, so the alert must
    -- say that instead of naming the admin as the buyer.
    SELECT COALESCE(display_name, username, 'An admin') INTO uname FROM public.profiles WHERE id = NEW.user_id;
    INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
    VALUES (
      'manual_order',
      'Manual order',
      uname || ' added a manual order for ' || COALESCE(NULLIF(trim(NEW.shipping_name), ''), 'a customer')
        || ' (' || csym || (NEW.total_cents/100.0)::numeric(10,2) || ')',
      '/shop?view=orders&id=' || NEW.id::text,
      NEW.id
    );
    RETURN NEW;
  END IF;
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES (
    'order_placed',
    'New order',
    uname || ' placed an order (' || csym || (NEW.total_cents/100.0)::numeric(10,2) || ')',
    '/shop?view=orders&id=' || NEW.id::text,
    NEW.id
  );
  RETURN NEW;
END; $$;
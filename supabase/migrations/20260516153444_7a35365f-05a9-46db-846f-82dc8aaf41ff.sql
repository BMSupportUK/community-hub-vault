CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uname TEXT;
  csym TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  SELECT COALESCE(value->>'symbol', '£') INTO csym FROM public.app_settings WHERE key = 'currency';
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
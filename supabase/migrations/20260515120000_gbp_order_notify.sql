-- Fix order placed notification to use £ instead of $
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('order_placed', 'New order', uname || ' placed an order (£' || (NEW.total_cents/100.0)::numeric(10,2) || ')', '/shop?view=admin', NEW.id);
  RETURN NEW;
END; $$;

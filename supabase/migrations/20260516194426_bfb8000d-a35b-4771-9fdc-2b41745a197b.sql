CREATE OR REPLACE FUNCTION public.notify_ticket_raised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text;
BEGIN
  SELECT COALESCE(display_name, username, 'A user') INTO v_username
    FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES (
    'ticket_raised',
    'New support ticket: ' || NEW.subject,
    COALESCE(v_username, 'A user') || ' raised a ' || NEW.priority::text || ' priority ticket needing assistance.',
    '/tickets',
    NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_ticket_raised ON public.tickets;
CREATE TRIGGER trg_notify_ticket_raised
AFTER INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_raised();
CREATE OR REPLACE FUNCTION public.notify_staff_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  uname TEXT;
  csym TEXT;
BEGIN
  IF NEW.paid_at IS NULL OR OLD.paid_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(display_name, username, 'A customer') INTO uname
  FROM public.profiles WHERE id = NEW.user_id;
  SELECT COALESCE(value->>'symbol', '£') INTO csym
  FROM public.app_settings WHERE key = 'currency';

  INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
  SELECT DISTINCT ur.user_id,
         'order_paid',
         'Payment confirmed',
         COALESCE(uname, 'A customer') || ' paid ' || COALESCE(csym, '£') || (NEW.total_cents/100.0)::numeric(10,2)::text,
         '/shop?view=orders&id=' || NEW.id::text,
         'order',
         NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::public.app_role, 'management'::public.app_role);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_staff_order_paid ON private.orders;
CREATE TRIGGER trg_notify_staff_order_paid
AFTER UPDATE OF paid_at ON private.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_staff_order_paid();
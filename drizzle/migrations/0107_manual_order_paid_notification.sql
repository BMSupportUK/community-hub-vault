CREATE OR REPLACE FUNCTION public.notify_staff_order_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE uname TEXT; csym TEXT; payer TEXT; v_title TEXT; v_body TEXT;
BEGIN
  IF NEW.paid_at IS NULL OR OLD.paid_at IS NOT NULL THEN RETURN NEW; END IF;
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  SELECT COALESCE(value->>'symbol', '£') INTO csym FROM public.app_settings WHERE key = 'currency';
  IF NEW.customer_type = 'manual' THEN
    SELECT COALESCE(display_name, username, 'An admin') INTO payer FROM public.profiles WHERE id = NEW.paid_by;
    v_title := 'Manual order paid';
    v_body := COALESCE(payer, 'An admin') || ' marked the manual order for ' || COALESCE(NEW.shipping_name, uname, 'a customer')
              || ' as paid (' || COALESCE(csym, '£') || (NEW.total_cents/100.0)::numeric(10,2)::text || ')';
  ELSE
    v_title := 'Payment confirmed';
    v_body := COALESCE(uname, 'A customer') || ' paid ' || COALESCE(csym, '£') || (NEW.total_cents/100.0)::numeric(10,2)::text;
  END IF;
  INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
  SELECT DISTINCT ur.user_id, 'order_paid', v_title, v_body,
         '/shop?view=orders&id=' || NEW.id::text, 'order', NEW.id
  FROM public.user_roles ur
  WHERE ur.role IN ('admin'::public.app_role, 'management'::public.app_role)
    AND NOT EXISTS (SELECT 1 FROM public.user_notifications un
                    WHERE un.user_id = ur.user_id AND un.kind = 'order_paid'
                      AND un.source_type = 'order' AND un.source_id = NEW.id);
  RETURN NEW;
END;
$function$;

INSERT INTO public.role_definitions (name, label, is_system, sort_order, is_active)
VALUES ('subscriber', 'Subscriber', false, 50, true)
ON CONFLICT (name) DO UPDATE SET is_active = true, label = EXCLUDED.label;

CREATE OR REPLACE FUNCTION public.grant_subscriber_on_completed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed'::order_status
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.user_id IS NOT NULL THEN
    IF NOT public.has_any_role(NEW.user_id, ARRAY['admin','management','staff','moderator']::app_role[]) THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (NEW.user_id, 'subscriber'::app_role)
      ON CONFLICT DO NOTHING;
      DELETE FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'member'::app_role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_subscriber_on_completed_order_trg ON public.orders;
CREATE TRIGGER grant_subscriber_on_completed_order_trg
AFTER UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.grant_subscriber_on_completed_order();

ALTER TABLE public.user_roles REPLICA IDENTITY FULL;

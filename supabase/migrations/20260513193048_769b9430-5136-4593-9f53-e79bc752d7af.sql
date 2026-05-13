
-- notifications table (broadcast to staff; per-user read tracking via separate table)
CREATE TABLE public.staff_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL, -- 'gate_application' | 'order_placed'
  title TEXT NOT NULL,
  body TEXT,
  link_path TEXT,
  entity_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.staff_notification_reads (
  notification_id UUID NOT NULL REFERENCES public.staff_notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  read_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

ALTER TABLE public.staff_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notif read staff" ON public.staff_notifications
  FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role]));

CREATE POLICY "notif insert system" ON public.staff_notifications
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "notif reads read self" ON public.staff_notification_reads
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "notif reads insert self" ON public.staff_notification_reads
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid()
    AND has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role]));

-- trigger: gate application
CREATE OR REPLACE FUNCTION public.notify_new_gate_application()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'New user') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('gate_application', 'New access request', uname || ' is requesting access', '/moderation', NEW.id);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_gate_application
AFTER INSERT ON public.gate_applications
FOR EACH ROW EXECUTE FUNCTION public.notify_new_gate_application();

-- trigger: order placed
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'A customer') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('order_placed', 'New order', uname || ' placed an order ($' || (NEW.total_cents/100.0)::numeric(10,2) || ')', '/shop?view=admin', NEW.id);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_notify_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_notification_reads;

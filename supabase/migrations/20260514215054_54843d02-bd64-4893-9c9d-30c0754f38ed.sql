
-- Enums
DO $$ BEGIN
  CREATE TYPE public.slot_type AS ENUM ('shift','hourly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.request_status AS ENUM ('pending','approved','denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- shift_slots
CREATE TABLE IF NOT EXISTS public.shift_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  slot_type public.slot_type NOT NULL DEFAULT 'shift',
  assigned_to uuid NULL,
  notes text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shift_slots_date ON public.shift_slots(shift_date);
ALTER TABLE public.shift_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shift_slots read approved" ON public.shift_slots FOR SELECT TO authenticated
USING (NOT public.has_role(auth.uid(),'pending'::app_role) AND NOT public.has_role(auth.uid(),'banned'::app_role));

CREATE POLICY "shift_slots manage admin" ON public.shift_slots FOR ALL TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

-- Allow staff/mod to claim or release their own slot (UPDATE only)
CREATE POLICY "shift_slots claim self" ON public.shift_slots FOR UPDATE TO authenticated
USING (
  public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role])
)
WITH CHECK (
  assigned_to IS NULL OR assigned_to = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role])
);

CREATE TRIGGER shift_slots_set_updated_at BEFORE UPDATE ON public.shift_slots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- holiday_requests
CREATE TABLE IF NOT EXISTS public.holiday_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.holiday_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hol read own or admin" ON public.holiday_requests FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE POLICY "hol insert self" ON public.holiday_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "hol update admin" ON public.holiday_requests FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TRIGGER hol_set_updated_at BEFORE UPDATE ON public.holiday_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- shift_swap_requests
CREATE TABLE IF NOT EXISTS public.shift_swap_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL,
  requester_id uuid NOT NULL,
  target_user_id uuid NULL,
  message text NULL,
  status public.request_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid NULL,
  reviewed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shift_swap_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap read own or admin" ON public.shift_swap_requests FOR SELECT TO authenticated
USING (
  requester_id = auth.uid() OR target_user_id = auth.uid()
  OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role])
);

CREATE POLICY "swap insert self" ON public.shift_swap_requests FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid());

CREATE POLICY "swap update admin" ON public.shift_swap_requests FOR UPDATE TO authenticated
USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TRIGGER swap_set_updated_at BEFORE UPDATE ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Notifications: holiday request
CREATE OR REPLACE FUNCTION public.notify_new_holiday_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'Someone') INTO uname FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('holiday_request', 'Holiday request',
    uname || ' requested holiday ' || NEW.start_date::text || ' → ' || NEW.end_date::text,
    '/shifts?tab=requests', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_holiday_notify AFTER INSERT ON public.holiday_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_holiday_request();

-- Notifications: swap request
CREATE OR REPLACE FUNCTION public.notify_new_swap_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  SELECT COALESCE(display_name, username, 'Someone') INTO uname FROM public.profiles WHERE id = NEW.requester_id;
  INSERT INTO public.staff_notifications (kind, title, body, link_path, entity_id)
  VALUES ('shift_swap', 'Shift swap request',
    uname || ' is requesting a shift swap',
    '/shifts?tab=requests', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_swap_notify AFTER INSERT ON public.shift_swap_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_swap_request();

-- Allow notif read for new kinds
DROP POLICY IF EXISTS "notif read staff" ON public.staff_notifications;
CREATE POLICY "notif read staff" ON public.staff_notifications FOR SELECT TO authenticated
USING (
  CASE
    WHEN kind = ANY (ARRAY['gate_application','order_placed','holiday_request','shift_swap']) THEN
      public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role])
    ELSE
      public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
  END
);

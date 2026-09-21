CREATE TABLE public.shift_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID,
  user_id UUID NOT NULL,
  action TEXT NOT NULL DEFAULT 'claimed',
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  slot_type TEXT,
  required_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shift_bookings_action_check CHECK (action IN ('claimed','released'))
);

CREATE INDEX shift_bookings_user_created_idx ON public.shift_bookings (user_id, created_at DESC);
CREATE INDEX shift_bookings_created_idx ON public.shift_bookings (created_at DESC);

GRANT SELECT, INSERT ON public.shift_bookings TO authenticated;
GRANT ALL ON public.shift_bookings TO service_role;

ALTER TABLE public.shift_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own bookings readable" ON public.shift_bookings
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'staff')
    OR public.has_role(auth.uid(), 'moderator')
  );

CREATE POLICY "Insert own bookings" ON public.shift_bookings
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
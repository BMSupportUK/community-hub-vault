CREATE TABLE public.order_support_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES private.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','live','ended','expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at TIMESTAMPTZ,
  joined_by UUID REFERENCES auth.users(id),
  ended_at TIMESTAMPTZ,
  ended_by TEXT,
  staff_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_support_sessions_order_idx ON public.order_support_sessions (order_id, status, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.order_support_sessions TO authenticated;
GRANT ALL ON public.order_support_sessions TO service_role;
ALTER TABLE public.order_support_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read support sessions"
  ON public.order_support_sessions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can update support sessions"
  ON public.order_support_sessions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'staff'));

CREATE TABLE public.order_support_session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.order_support_sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('customer','staff')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX order_support_session_messages_session_idx ON public.order_support_session_messages (session_id, created_at);
GRANT SELECT, INSERT ON public.order_support_session_messages TO authenticated;
GRANT ALL ON public.order_support_session_messages TO service_role;
ALTER TABLE public.order_support_session_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can read support session messages"
  ON public.order_support_session_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'staff'));
CREATE POLICY "Staff can send support session messages"
  ON public.order_support_session_messages FOR INSERT TO authenticated
  WITH CHECK (sender = 'staff' AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'staff')));
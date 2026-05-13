
-- Enums
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'waiting', 'resolved', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');

-- Categories
CREATE TABLE public.ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  icon text NOT NULL DEFAULT 'LifeBuoy',
  color text NOT NULL DEFAULT 'primary',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ticket_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories read all" ON public.ticket_categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "categories manage admin" ON public.ticket_categories
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

-- Tickets
CREATE TABLE public.tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category_id uuid NOT NULL REFERENCES public.ticket_categories(id) ON DELETE RESTRICT,
  subject text NOT NULL,
  status public.ticket_status NOT NULL DEFAULT 'open',
  priority public.ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE INDEX idx_tickets_user ON public.tickets(user_id);
CREATE INDEX idx_tickets_status ON public.tickets(status);
CREATE INDEX idx_tickets_assigned ON public.tickets(assigned_to);

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets read own or staff" ON public.tickets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role]));

CREATE POLICY "tickets insert self" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tickets update staff" ON public.tickets
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role]));

CREATE POLICY "tickets delete admin" ON public.tickets
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Messages
CREATE TABLE public.ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tmsg read participants" ON public.ticket_messages
  FOR SELECT TO authenticated
  USING (
    (
      EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND t.user_id = auth.uid())
      AND is_internal = false
    )
    OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role])
  );

CREATE POLICY "tmsg insert participants" ON public.ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (
        EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_messages.ticket_id AND t.user_id = auth.uid())
        AND is_internal = false
      )
      OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'staff'::app_role,'moderator'::app_role])
    )
  );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_messages;

-- Seed categories
INSERT INTO public.ticket_categories (name, slug, description, icon, color, sort_order) VALUES
  ('General Support', 'general', 'Questions and general help', 'LifeBuoy', 'primary', 10),
  ('Billing', 'billing', 'Payments, invoices and subscriptions', 'CreditCard', 'success', 20),
  ('Bug Report', 'bug', 'Something is broken', 'Bug', 'destructive', 30),
  ('Feature Request', 'feature', 'Ideas and improvements', 'Sparkles', 'accent', 40),
  ('Account', 'account', 'Login, roles, profile', 'UserCog', 'warning', 50);

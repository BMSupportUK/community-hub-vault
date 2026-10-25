CREATE TABLE public.ticket_remote_setup (
  ticket_id uuid PRIMARY KEY,
  device text NOT NULL CHECK (device IN ('amazon','android')),
  confirmed_steps int[] NOT NULL DEFAULT '{}',
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_remote_setup TO authenticated;
GRANT ALL ON public.ticket_remote_setup TO service_role;
ALTER TABLE public.ticket_remote_setup ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visible with the ticket" ON public.ticket_remote_setup FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id));
CREATE POLICY "Ticket customer inserts" ON public.ticket_remote_setup FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "Ticket customer updates" ON public.ticket_remote_setup FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "Ticket customer resets" ON public.ticket_remote_setup FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()));
CREATE TABLE public.ticket_video_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  started_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','live','ended','declined','missed')),
  joined_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  ended_at timestamptz,
  ended_by uuid
);
CREATE INDEX ticket_video_calls_ticket_idx ON public.ticket_video_calls(ticket_id, created_at DESC);
GRANT SELECT ON public.ticket_video_calls TO authenticated;
GRANT ALL ON public.ticket_video_calls TO service_role;
ALTER TABLE public.ticket_video_calls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ticket owner and staff can view video calls" ON public.ticket_video_calls
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'staff')
);
ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_video_calls;
CREATE TABLE IF NOT EXISTS public.ticket_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);

ALTER TABLE public.ticket_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket_ratings read approved"
ON public.ticket_ratings FOR SELECT TO authenticated
USING ((NOT has_role(auth.uid(), 'pending'::app_role)) AND (NOT has_role(auth.uid(), 'banned'::app_role)));

CREATE POLICY "ticket_ratings insert own"
ON public.ticket_ratings FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
);

CREATE POLICY "ticket_ratings update own"
ON public.ticket_ratings FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "ticket_ratings delete own or admin"
ON public.ticket_ratings FOR DELETE TO authenticated
USING (user_id = auth.uid() OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

CREATE TRIGGER trg_ticket_ratings_updated
BEFORE UPDATE ON public.ticket_ratings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_ticket_ratings_ticket ON public.ticket_ratings(ticket_id);
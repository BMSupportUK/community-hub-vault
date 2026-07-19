
CREATE TABLE public.prediction_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition TEXT NOT NULL CHECK (competition IN ('wc2026','boro2026')),
  place SMALLINT NOT NULL CHECK (place IN (1,2,3)),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notified_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (competition, place),
  UNIQUE (competition, user_id)
);

GRANT SELECT ON public.prediction_winners TO authenticated;
GRANT ALL ON public.prediction_winners TO service_role;

ALTER TABLE public.prediction_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view winners"
  ON public.prediction_winners FOR SELECT TO authenticated USING (true);

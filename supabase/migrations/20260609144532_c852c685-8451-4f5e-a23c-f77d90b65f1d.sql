
-- 1) wc_entrants table
CREATE TABLE IF NOT EXISTS public.wc_entrants (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.wc_entrants TO authenticated;
GRANT ALL ON public.wc_entrants TO service_role;

ALTER TABLE public.wc_entrants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wc_entrants_select_own" ON public.wc_entrants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "wc_entrants_select_admin" ON public.wc_entrants
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));

CREATE POLICY "wc_entrants_insert_self" ON public.wc_entrants
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "wc_entrants_delete_self" ON public.wc_entrants
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- 2) Replace prediction insert/update RLS to use wc_entrants
DROP POLICY IF EXISTS "wc_predictions_insert_own" ON public.wc_predictions;
DROP POLICY IF EXISTS "wc_predictions_update_own" ON public.wc_predictions;

CREATE POLICY "wc_predictions_insert_own" ON public.wc_predictions
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.wc_entrants e WHERE e.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.wc_fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );

CREATE POLICY "wc_predictions_update_own" ON public.wc_predictions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.wc_entrants e WHERE e.user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.wc_fixtures f WHERE f.id = fixture_id AND f.kickoff_at > now())
  );

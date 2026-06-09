DROP POLICY IF EXISTS wc_predictions_insert_own ON public.wc_predictions;
DROP POLICY IF EXISTS wc_predictions_update_own ON public.wc_predictions;

CREATE POLICY wc_predictions_insert_own ON public.wc_predictions
FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.wc_entrants e WHERE e.user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.wc_fixtures f
    WHERE f.id = fixture_id
      AND f.kickoff_at > now() + interval '30 minutes'
  )
);

CREATE POLICY wc_predictions_update_own ON public.wc_predictions
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.wc_entrants e WHERE e.user_id = auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.wc_fixtures f
    WHERE f.id = fixture_id
      AND f.kickoff_at > now() + interval '30 minutes'
  )
);
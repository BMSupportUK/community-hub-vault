DROP POLICY "Admins manage fantasy scoring rules" ON public.fantasy_scoring_rules;
CREATE POLICY "Admins manage fantasy scoring rules"
  ON public.fantasy_scoring_rules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TABLE public.password_change_required (
  user_id uuid PRIMARY KEY,
  set_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.password_change_required TO authenticated;
GRANT ALL ON public.password_change_required TO service_role;
ALTER TABLE public.password_change_required ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own reset flag" ON public.password_change_required FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users clear own reset flag" ON public.password_change_required FOR DELETE TO authenticated USING (user_id = auth.uid());
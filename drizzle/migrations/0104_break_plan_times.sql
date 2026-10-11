CREATE TABLE public.break_plan_times (
  user_id uuid NOT NULL,
  shift_date date NOT NULL,
  label text NOT NULL,
  kind text NOT NULL,
  start_min integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, shift_date, label)
);
GRANT SELECT ON public.break_plan_times TO authenticated;
GRANT ALL ON public.break_plan_times TO service_role;
ALTER TABLE public.break_plan_times ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own or managers read break plan" ON public.break_plan_times FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));
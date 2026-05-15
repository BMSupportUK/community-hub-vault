CREATE TABLE public.user_ignores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ignorer_id uuid NOT NULL,
  ignored_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ignorer_id, ignored_id),
  CHECK (ignorer_id <> ignored_id)
);

CREATE INDEX idx_user_ignores_ignorer ON public.user_ignores(ignorer_id);

ALTER TABLE public.user_ignores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ignores read own" ON public.user_ignores
  FOR SELECT TO authenticated
  USING (ignorer_id = auth.uid());

CREATE POLICY "ignores delete own" ON public.user_ignores
  FOR DELETE TO authenticated
  USING (ignorer_id = auth.uid());

CREATE OR REPLACE FUNCTION public.prevent_ignore_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_any_role(NEW.ignored_id, ARRAY['admin','management','moderator','staff']::app_role[]) THEN
    RAISE EXCEPTION 'Staff members cannot be ignored';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_ignores_block_staff
  BEFORE INSERT ON public.user_ignores
  FOR EACH ROW EXECUTE FUNCTION public.prevent_ignore_staff();

CREATE POLICY "ignores insert own" ON public.user_ignores
  FOR INSERT TO authenticated
  WITH CHECK (ignorer_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_ignores;
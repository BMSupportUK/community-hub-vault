CREATE TABLE IF NOT EXISTS public.app_builds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size bigint,
  version_name text,
  release_notes text,
  is_current boolean NOT NULL DEFAULT true,
  is_available boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_builds TO authenticated;
GRANT ALL ON public.app_builds TO service_role;

ALTER TABLE public.app_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read available app build"
  ON public.app_builds FOR SELECT TO authenticated
  USING (is_available OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Staff manage app builds"
  ON public.app_builds FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER update_app_builds_updated_at
  BEFORE UPDATE ON public.app_builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.app_transfers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  build_id uuid NOT NULL REFERENCES public.app_builds(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  download_count integer NOT NULL DEFAULT 0,
  last_download_at timestamptz
);

GRANT SELECT, DELETE ON public.app_transfers TO authenticated;
GRANT ALL ON public.app_transfers TO service_role;

ALTER TABLE public.app_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own app transfers"
  ON public.app_transfers FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Users delete own app transfers"
  ON public.app_transfers FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE INDEX IF NOT EXISTS app_transfers_user_idx ON public.app_transfers (user_id, expires_at DESC);

CREATE POLICY "Staff manage app build files"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'app-builds' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (bucket_id = 'app-builds' AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));
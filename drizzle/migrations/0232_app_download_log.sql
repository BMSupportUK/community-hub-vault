CREATE TABLE public.app_download_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('enabler_phone','enabler_windows','tv_install','remote_helper','transfer_link','android_apk')),
  build_id uuid,
  app_name text,
  version_name text,
  user_id uuid,
  ticket_id uuid,
  order_id uuid,
  ip text,
  user_agent text,
  device text,
  bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_download_log TO authenticated;
GRANT ALL ON public.app_download_log TO service_role;
ALTER TABLE public.app_download_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read download log" ON public.app_download_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE INDEX app_download_log_created_idx ON public.app_download_log (created_at DESC);
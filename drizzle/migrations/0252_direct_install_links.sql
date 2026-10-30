CREATE TABLE public.direct_install_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_count integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.direct_install_links TO authenticated;
GRANT ALL ON public.direct_install_links TO service_role;
ALTER TABLE public.direct_install_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their direct install links" ON public.direct_install_links FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE INDEX direct_install_links_user_idx ON public.direct_install_links(user_id, created_at DESC);
ALTER TABLE public.app_download_log DROP CONSTRAINT app_download_log_source_check;
ALTER TABLE public.app_download_log ADD CONSTRAINT app_download_log_source_check CHECK (source IN ('enabler_phone','enabler_windows','tv_install','remote_helper','transfer_link','android_apk','self_install','direct_install'));
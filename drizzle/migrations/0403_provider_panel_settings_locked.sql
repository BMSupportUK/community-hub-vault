CREATE TABLE public.provider_panel_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  url_enc text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT ALL ON public.provider_panel_settings TO service_role;
REVOKE ALL ON public.provider_panel_settings FROM anon, authenticated;
ALTER TABLE public.provider_panel_settings ENABLE ROW LEVEL SECURITY;
DELETE FROM public.app_settings WHERE key = 'provider_panel_url';
ALTER TABLE public.direct_install_links
  ADD COLUMN IF NOT EXISTS downloaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS signed_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS permission_at timestamptz,
  ADD COLUMN IF NOT EXISTS code_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.enabler_handoffs
  ADD COLUMN IF NOT EXISTS signed_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS permission_at timestamptz;

COMMENT ON COLUMN public.enabler_handoffs.signed_in_at IS 'When the installer app signed in with the PIN for this handoff.';
COMMENT ON COLUMN public.enabler_handoffs.permission_at IS 'When the TV allowed install-unknown-apps (BM Direct Install only).';
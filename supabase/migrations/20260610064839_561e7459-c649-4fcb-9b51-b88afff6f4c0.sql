ALTER TABLE public.wc_guest_entrants
  ADD COLUMN IF NOT EXISTS pin_reset_hash text,
  ADD COLUMN IF NOT EXISTS pin_reset_expires_at timestamptz;
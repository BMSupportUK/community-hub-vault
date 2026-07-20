ALTER TABLE public.prediction_winners
  ADD COLUMN IF NOT EXISTS voucher_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voucher_sent_by UUID;
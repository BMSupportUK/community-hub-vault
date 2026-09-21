ALTER TABLE public.shifts
  ADD COLUMN IF NOT EXISTS end_prompt_asked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS still_working_ack_at TIMESTAMPTZ;
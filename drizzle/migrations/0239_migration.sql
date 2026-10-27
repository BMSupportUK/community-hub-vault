ALTER TABLE public.enabler_confirm_codes ADD COLUMN IF NOT EXISTS pin_id uuid;
CREATE INDEX IF NOT EXISTS enabler_confirm_codes_pin_id_idx ON public.enabler_confirm_codes(pin_id);
ALTER TABLE public.enabler_login_pins ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS enabler_login_pins_user_idx ON public.enabler_login_pins(user_id);
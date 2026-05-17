ALTER TABLE public.signup_info
  ADD COLUMN IF NOT EXISTS geo_latitude double precision,
  ADD COLUMN IF NOT EXISTS geo_longitude double precision,
  ADD COLUMN IF NOT EXISTS geo_accuracy_m double precision,
  ADD COLUMN IF NOT EXISTS geo_permission text;
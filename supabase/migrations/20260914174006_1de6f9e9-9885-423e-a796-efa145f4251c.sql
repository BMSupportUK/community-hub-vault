ALTER TABLE public.profiles
ADD COLUMN preferred_theme text NULL;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_preferred_theme_check
CHECK (preferred_theme IS NULL OR preferred_theme IN ('purple', 'red', 'ocean', 'sunset', 'pink'));

COMMENT ON COLUMN public.profiles.preferred_theme IS 'Optional per-user visual theme override; null uses the site default.';
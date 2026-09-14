ALTER TABLE public.profiles
DROP CONSTRAINT profiles_preferred_theme_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_preferred_theme_check
CHECK (preferred_theme IS NULL OR preferred_theme IN ('purple', 'red', 'ocean', 'sunset', 'pink', 'berry'));
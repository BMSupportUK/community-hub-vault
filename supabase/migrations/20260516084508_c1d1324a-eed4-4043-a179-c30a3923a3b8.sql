ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS sports_blogs_baseline_at timestamptz;
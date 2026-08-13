ALTER TABLE public.fan_zone_members
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;

UPDATE public.fan_zone_members m
SET is_private = true
WHERE EXISTS (
  SELECT 1 FROM public.profiles p WHERE p.id = m.user_id AND p.is_private = true
);
ALTER TABLE public.nameplates ADD COLUMN IF NOT EXISTS animation_class text;

INSERT INTO public.nameplates (name, description, image_url, animation_class, is_active, sort_order)
VALUES (
  'Soccer Night',
  'Animated stadium pitch with rolling soccer balls',
  'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/soccer.png',
  'nameplate-soccer-scroll',
  true,
  100
);
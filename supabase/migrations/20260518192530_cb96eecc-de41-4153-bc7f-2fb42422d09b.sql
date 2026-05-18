
-- Replace old soccer placeholder if present, then add two new animated nameplates.
DELETE FROM public.nameplates WHERE name = 'Soccer Night';

INSERT INTO public.nameplates (name, description, image_url, animation_class, is_active, sort_order)
VALUES
  (
    'Soccer Striker',
    'Sunset stadium pan with stadium-light flares and a streaking sheen.',
    'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v3/soccer-player.jpg',
    'nameplate-pitch',
    true,
    110
  ),
  (
    'Hotdog DJ',
    'A bopping hotdog with headphones, sparkles, and a hue-shifting groove.',
    'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v3/hotdog-headphones.jpg',
    'nameplate-hotdog',
    true,
    120
  );

DELETE FROM public.nameplates;

INSERT INTO public.nameplates (name, description, image_url, is_active, sort_order) VALUES
('Mushroom Grove', 'Toadstool & grass charm', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/mushroom.png', true, 10),
('Pumpkin', 'Spooky jack-o-lantern', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/pumpkin.png', true, 20),
('Aurora Peaks', 'Northern lights over mountains', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/aurora.png', true, 30),
('Inferno', 'Wreathed in flames', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/fire.png', true, 40),
('Bubbles', 'Crystal blue water', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/water.png', true, 50),
('Sakura Pagoda', 'Cherry blossoms & pagoda', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/sakura.png', true, 60),
('Checkered Flag', 'Racing finish line', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/racing.png', true, 70),
('Pirate Plank', 'Skull & crossbones', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/pirate.png', true, 80),
('Neon City', 'Cyberpunk skyline', 'https://vzrbdawlqyealnlrtwgj.supabase.co/storage/v1/object/public/nameplates/v2/city.png', true, 90);
UPDATE public.nameplates SET is_free = true WHERE is_free = false;

INSERT INTO public.nameplates (name, description, gradient_css, animation_class, is_active, is_free, sort_order) VALUES
('Alpine Cross', 'Deep red banner with a glowing white cross and a gloss sweep.', 'linear-gradient(90deg,#8c0f16,#c8102e 60%,#e11b22)', 'nameplate-alpine', true, true, 200),
('Sunlit Radiance', 'Ember gradient with a slowly turning blazing sun.', 'linear-gradient(90deg,#3d0d0d,#7c1d1d 45%,#d97706)', 'nameplate-sunlit', true, true, 201),
('Crimson Static', 'Red bar shot through with flickering broadcast static.', 'linear-gradient(90deg,#2b0406,#8b0f18 55%,#e02424)', 'nameplate-static', true, true, 202),
('Swamp Sage', 'Misty green marsh with a hooded little elder.', 'linear-gradient(90deg,#0f1a10,#26402a 55%,#4f7a41)', 'nameplate-swampsage', true, true, 203),
('Little Green Crew', 'Starry night sky with two bobbing green buddies.', 'linear-gradient(90deg,#0b1030,#1e3a8a 55%,#0e7490)', 'nameplate-greencrew', true, true, 204),
('Rolling Droid', 'Sand and gold with a droid rolling across the bar.', 'linear-gradient(90deg,#5b4620,#a97e2f 50%,#e0b463)', 'nameplate-droid', true, true, 205),
('Web Rivals', 'Two masked rivals face off under a red pulse.', 'linear-gradient(90deg,#170406,#5b0d12 55%,#a51420)', 'nameplate-rivals', true, true, 206),
('Web Lines', 'Maroon plate strung with fine drifting web strands.', 'linear-gradient(90deg,#2a0509,#6b0f16 60%,#8f141d)', 'nameplate-weblines', true, true, 207),
('Ice Rider', 'A rider streaks across an icy blue horizon.', 'linear-gradient(90deg,#0b2540,#1d4ed8 50%,#bfdbfe)', 'nameplate-icerider', true, true, 208),
('Dark Helm', 'Black armour and a red-lit helm in the shadows.', 'linear-gradient(90deg,#000000,#1a0407 55%,#7f1d1d)', 'nameplate-darkhelm', true, true, 209),
('Desert Pod', 'A hovering pod drifting over sunlit dunes.', 'linear-gradient(90deg,#14301c,#3f6b34 45%,#c8a061)', 'nameplate-desertpod', true, true, 210),
('Retro Broadcast', 'Purple haze with a little CRT and rolling scanlines.', 'linear-gradient(90deg,#1e0b33,#4c1d95 55%,#7c3aed)', 'nameplate-retrobroadcast', true, true, 211),
('Cosmic Cub', 'Nebula bubbles and a star-marked space cub.', 'linear-gradient(90deg,#1b0b3a,#4c1d95 45%,#7e22ce)', 'nameplate-cosmiccub', true, true, 212),
('Berry Kitty', 'Pink plate with floating hearts and a strawberry cat.', 'linear-gradient(90deg,#3d0f22,#7f1d3f 55%,#db2777)', 'nameplate-berrykitty', true, true, 213),
('Midnight Kitty', 'Midnight blue sparkles around a little black cat.', 'linear-gradient(90deg,#040b1a,#0b2545 55%,#1d4ed8)', 'nameplate-midnightkitty', true, true, 214);
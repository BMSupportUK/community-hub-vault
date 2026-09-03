INSERT INTO public.nav_order (key, sort_order)
SELECT 'support:' || key, sort_order FROM public.nav_order
WHERE key IN ('/home','/home/$channel','/tickets','/shop','/install-guides','/sports-guides','/knowledge-base','/what-to-watch','/leaderboard','/new-content','/members','/staff','/forum')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.nav_order (key, sort_order)
SELECT 'fanzone:' || key, sort_order FROM public.nav_order
WHERE key IN ('/home','/forum','/fanzone/messages','/admin-fan-zone','/fanzone/profile','/boro-fantasy','/predictions','/boro-predictions','/competition-winners')
ON CONFLICT (key) DO NOTHING;
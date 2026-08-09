INSERT INTO public.email_list_members (email, list_key, source)
SELECT DISTINCT lower(email), 'competitions', 'fantasy_guest_entrants'
FROM public.fantasy_guest_entrants WHERE email IS NOT NULL
ON CONFLICT (email, list_key) DO NOTHING;
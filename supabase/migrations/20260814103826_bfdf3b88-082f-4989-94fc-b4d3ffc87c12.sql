INSERT INTO public.fan_zone_members (user_id, status, decided_at, fan_alias)
VALUES ('91304401-78e5-4907-803e-34da8008a0a4', 'approved', now(), 'Boro Matchday Action')
ON CONFLICT (user_id) DO UPDATE SET status='approved', fan_alias='Boro Matchday Action', updated_at=now();
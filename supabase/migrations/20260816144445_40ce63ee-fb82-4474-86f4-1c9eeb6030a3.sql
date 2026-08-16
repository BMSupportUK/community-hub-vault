UPDATE public.boro_match_centre
SET
  last_result = last_result || jsonb_build_object(
    'eventId', '401880336',
    'espnSlug', 'eng.2',
    'homeLogo', 'https://a.espncdn.com/i/teamlogos/soccer/500/369.png',
    'awayLogo', 'https://a.espncdn.com/i/teamlogos/soccer/500/314.png'
  ),
  next_fixture = next_fixture || jsonb_build_object(
    'eventId', '401880336',
    'espnSlug', 'eng.2',
    'homeLogo', 'https://a.espncdn.com/i/teamlogos/soccer/500/369.png',
    'awayLogo', 'https://a.espncdn.com/i/teamlogos/soccer/500/314.png'
  ),
  updated_at = now()
WHERE id = 'singleton'
  AND last_result->>'home' = 'Middlesbrough'
  AND last_result->>'away' = 'Lincoln City';
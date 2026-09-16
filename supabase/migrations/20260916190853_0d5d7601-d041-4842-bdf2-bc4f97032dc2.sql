REVOKE EXECUTE ON FUNCTION public.fantasy_score_gameweek(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fantasy_score_gameweek(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.fantasy_score_gameweek(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fantasy_score_gameweek(uuid) TO service_role;
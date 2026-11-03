CREATE OR REPLACE FUNCTION public.player_cast_rating(p_voter text, p_key text, p_stars integer) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF p_voter !~ '^(user|offsite):[0-9a-f-]{36}$' OR p_key !~ '^[0-9a-f]{64}$' OR p_stars NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid vote'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_voter, 0));
 IF EXISTS (SELECT 1 FROM public.player_ratings WHERE voter_key = p_voter AND media_key = p_key) THEN RAISE EXCEPTION 'Already voted'; END IF;
 IF (SELECT count(*) FROM public.player_ratings WHERE voter_key = p_voter AND updated_at > now() - interval '1 minute') >= 30 THEN RAISE EXCEPTION 'Rate limit'; END IF;
 INSERT INTO public.player_ratings(media_key, voter_key, stars) VALUES(p_key, p_voter, p_stars);
END $$;
REVOKE ALL ON FUNCTION public.player_cast_rating(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_cast_rating(text, text, integer) TO service_role;
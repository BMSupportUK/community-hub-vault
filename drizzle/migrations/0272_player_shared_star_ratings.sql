CREATE TABLE public.player_ratings (
  media_key text NOT NULL CHECK (media_key ~ '^[0-9a-f]{64}$'),
  voter_key text NOT NULL CHECK (voter_key ~ '^(user|offsite):[0-9a-f-]{36}$'),
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (media_key, voter_key)
);
GRANT ALL ON public.player_ratings TO service_role;
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_ratings_service ON public.player_ratings TO service_role USING (true) WITH CHECK (true);
CREATE INDEX player_ratings_voter_updated ON public.player_ratings (voter_key, updated_at DESC);
CREATE TABLE public.player_rating_totals (
  media_key text PRIMARY KEY CHECK (media_key ~ '^[0-9a-f]{64}$'),
  star_sum bigint NOT NULL DEFAULT 0,
  vote_count bigint NOT NULL DEFAULT 0,
  CHECK (vote_count >= 0 AND star_sum >= 0)
);
GRANT ALL ON public.player_rating_totals TO service_role;
ALTER TABLE public.player_rating_totals ENABLE ROW LEVEL SECURITY;
CREATE POLICY player_rating_totals_service ON public.player_rating_totals TO service_role USING (true) WITH CHECK (true);
CREATE FUNCTION public.player_rating_update_totals() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  INSERT INTO public.player_rating_totals(media_key, star_sum, vote_count) VALUES (NEW.media_key, NEW.stars, 1)
  ON CONFLICT (media_key) DO UPDATE SET star_sum = player_rating_totals.star_sum + NEW.stars, vote_count = player_rating_totals.vote_count + 1;
 ELSIF TG_OP = 'UPDATE' THEN
  UPDATE public.player_rating_totals SET star_sum = star_sum + NEW.stars - OLD.stars WHERE media_key = NEW.media_key;
 ELSE
  UPDATE public.player_rating_totals SET star_sum = star_sum - OLD.stars, vote_count = vote_count - 1 WHERE media_key = OLD.media_key;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.player_rating_update_totals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_rating_update_totals() TO service_role;
CREATE TRIGGER player_rating_totals_after_write AFTER INSERT OR UPDATE OR DELETE ON public.player_ratings FOR EACH ROW EXECUTE FUNCTION public.player_rating_update_totals();
CREATE FUNCTION public.player_cast_rating(p_voter text, p_key text, p_stars integer) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF p_voter !~ '^(user|offsite):[0-9a-f-]{36}$' OR p_key !~ '^[0-9a-f]{64}$' OR p_stars NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Invalid vote'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_voter, 0));
 IF (SELECT count(*) FROM public.player_ratings WHERE voter_key = p_voter AND updated_at > now() - interval '1 minute') >= 30 THEN RAISE EXCEPTION 'Rate limit'; END IF;
 INSERT INTO public.player_ratings(media_key, voter_key, stars) VALUES(p_key, p_voter, p_stars)
 ON CONFLICT (media_key, voter_key) DO UPDATE SET stars = EXCLUDED.stars, updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.player_cast_rating(text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_cast_rating(text, text, integer) TO service_role;
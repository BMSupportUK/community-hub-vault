-- 1. Remove predictions made on non-league fixtures
DELETE FROM public.boro_predictions p
USING public.boro_fixtures f
WHERE f.id = p.fixture_id AND coalesce(f.competition, '') <> 'Championship';

-- 2. Hard safeguard: only Championship fixtures may be predicted
CREATE OR REPLACE FUNCTION public.boro_predictions_league_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE comp text;
BEGIN
  SELECT competition INTO comp FROM public.boro_fixtures WHERE id = NEW.fixture_id;
  IF coalesce(comp, '') <> 'Championship' THEN
    RAISE EXCEPTION 'Boro score predictions are Championship (league) fixtures only — cup ties cannot be predicted.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS boro_predictions_league_only_trg ON public.boro_predictions;
CREATE TRIGGER boro_predictions_league_only_trg
BEFORE INSERT OR UPDATE OF fixture_id ON public.boro_predictions
FOR EACH ROW EXECUTE FUNCTION public.boro_predictions_league_only();

-- 3. Leaderboard counts league fixtures only
CREATE OR REPLACE VIEW public.boro_leaderboard AS
 WITH entrants AS (
         SELECT e_1.user_id AS entrant_id,
            pr.display_name,
            pr.username,
            pr.avatar_url,
            false AS is_guest
           FROM boro_entrants e_1
             LEFT JOIN profiles pr ON pr.id = e_1.user_id
        UNION ALL
         SELECT ge.id AS entrant_id,
            ge.display_name,
            NULL::text AS username,
            NULL::text AS avatar_url,
            true AS is_guest
           FROM boro_guest_entrants ge
        ), stats AS (
         SELECT COALESCE(p.user_id, p.guest_id) AS entrant_id,
            COALESCE(sum(p.points), 0::bigint)::integer AS total_points,
            count(*) FILTER (WHERE p.points = 5)::integer AS exact_count,
            count(*) FILTER (WHERE p.points = 3)::integer AS goal_diff_count,
            count(*) FILTER (WHERE p.points = 1)::integer AS result_count,
            count(*)::integer AS predictions_made,
            count(*) FILTER (WHERE p.points IS NOT NULL)::integer AS predictions_scored
           FROM boro_predictions p
             JOIN boro_fixtures f ON f.id = p.fixture_id AND f.competition = 'Championship'
          GROUP BY (COALESCE(p.user_id, p.guest_id))
        )
 SELECT e.entrant_id AS user_id,
    e.display_name,
    e.username,
    e.avatar_url,
    e.is_guest,
    COALESCE(s.total_points, 0) AS total_points,
    COALESCE(s.exact_count, 0) AS exact_count,
    COALESCE(s.goal_diff_count, 0) AS goal_diff_count,
    COALESCE(s.result_count, 0) AS result_count,
    COALESCE(s.predictions_made, 0) AS predictions_made,
    COALESCE(s.predictions_scored, 0) AS predictions_scored
   FROM entrants e
     LEFT JOIN stats s ON s.entrant_id = e.entrant_id;
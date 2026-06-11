CREATE TABLE IF NOT EXISTS public.wc_sync_state (
  id int PRIMARY KEY,
  request_id bigint
);
GRANT ALL ON public.wc_sync_state TO service_role;
ALTER TABLE public.wc_sync_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.wc_team_matches(db_name text, api_name text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(trim(db_name)) = lower(trim(api_name)) THEN true
    ELSE EXISTS (
      SELECT 1 FROM (VALUES
        (ARRAY['united states','usa','united states of america']),
        (ARRAY['south korea','korea republic','republic of korea']),
        (ARRAY['iran','ir iran','islamic republic of iran']),
        (ARRAY['ivory coast','côte d''ivoire','cote d''ivoire']),
        (ARRAY['türkiye','turkey','turkiye']),
        (ARRAY['dr congo','democratic republic of the congo','congo dr']),
        (ARRAY['republic of ireland','ireland']),
        (ARRAY['czech republic','czechia']),
        (ARRAY['bosnia and herzegovina','bosnia-herzegovina','bosnia & herzegovina']),
        (ARRAY['cape verde','cape verde islands'])
      ) AS a(names)
      WHERE lower(trim(db_name)) = ANY(a.names) AND lower(trim(api_name)) = ANY(a.names)
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.wc_sync_live_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  prev_id bigint;
  resp jsonb;
  ev jsonb;
  comp jsonb;
  st text;
  type_name text;
  new_status text;
  min_val int;
  home_name text;
  away_name text;
  hs int;
  aw int;
  ko timestamptz;
  fx_id uuid;
BEGIN
  SELECT request_id INTO prev_id FROM wc_sync_state WHERE id = 1;

  IF prev_id IS NOT NULL THEN
    SELECT content::jsonb INTO resp
    FROM net._http_response
    WHERE id = prev_id AND status_code = 200;

    IF resp IS NOT NULL THEN
      FOR ev IN SELECT jsonb_array_elements(coalesce(resp->'events', '[]'::jsonb)) LOOP
        comp := ev->'competitions'->0;
        st := comp->'status'->'type'->>'state';
        IF st IS DISTINCT FROM 'in' AND st IS DISTINCT FROM 'post' THEN
          CONTINUE;
        END IF;
        type_name := coalesce(comp->'status'->'type'->>'name', '');
        new_status := CASE
          WHEN st = 'post' THEN 'FINISHED'
          WHEN type_name = 'STATUS_HALFTIME' THEN 'PAUSED'
          ELSE 'IN_PLAY'
        END;
        min_val := CASE
          WHEN st = 'in' THEN NULLIF(substring(coalesce(comp->'status'->>'displayClock',''), '^\d+'), '')::int
          ELSE NULL
        END;
        SELECT c->'team'->>'displayName', NULLIF(c->>'score','')::int
          INTO home_name, hs
          FROM jsonb_array_elements(comp->'competitors') c
          WHERE c->>'homeAway' = 'home' LIMIT 1;
        SELECT c->'team'->>'displayName', NULLIF(c->>'score','')::int
          INTO away_name, aw
          FROM jsonb_array_elements(comp->'competitors') c
          WHERE c->>'homeAway' = 'away' LIMIT 1;
        ko := NULLIF(ev->>'date','')::timestamptz;
        IF home_name IS NULL OR away_name IS NULL OR ko IS NULL THEN
          CONTINUE;
        END IF;
        SELECT f.id INTO fx_id FROM wc_fixtures f
          WHERE public.wc_team_matches(f.home_team, home_name)
            AND public.wc_team_matches(f.away_team, away_name)
            AND abs(extract(epoch from (f.kickoff_at - ko))) <= 5*24*3600
          ORDER BY abs(extract(epoch from (f.kickoff_at - ko)))
          LIMIT 1;
        IF fx_id IS NOT NULL THEN
          UPDATE wc_fixtures
            SET status = new_status,
                minute = min_val,
                home_score = hs,
                away_score = aw
            WHERE id = fx_id
              AND (status IS DISTINCT FROM new_status
                OR minute IS DISTINCT FROM min_val
                OR home_score IS DISTINCT FROM hs
                OR away_score IS DISTINCT FROM aw);
        END IF;
        fx_id := NULL;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO wc_sync_state (id, request_id)
  VALUES (1, net.http_get('https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard'))
  ON CONFLICT (id) DO UPDATE SET request_id = excluded.request_id;
END;
$fn$;
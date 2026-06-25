CREATE OR REPLACE FUNCTION public.wc_apply_progression()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scored_count int;
  v_winner text;
  v_runner text;
  v_w text;
  v_l text;
BEGIN
  IF NEW.home_score IS NULL OR NEW.away_score IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.stage = 'group' AND NEW.group_label IS NOT NULL THEN
    SELECT count(*) INTO scored_count
      FROM public.wc_fixtures
      WHERE stage = 'group' AND group_label = NEW.group_label
        AND home_score IS NOT NULL AND away_score IS NOT NULL;
    IF scored_count = 6 THEN
      WITH games AS (
        SELECT home_team AS team, home_score AS gf, away_score AS ga
          FROM public.wc_fixtures
          WHERE stage='group' AND group_label = NEW.group_label
        UNION ALL
        SELECT away_team, away_score, home_score
          FROM public.wc_fixtures
          WHERE stage='group' AND group_label = NEW.group_label
      ), standing AS (
        SELECT team,
          SUM(CASE WHEN gf>ga THEN 3 WHEN gf=ga THEN 1 ELSE 0 END) AS pts,
          SUM(gf - ga) AS gd,
          SUM(gf)      AS gf_total
        FROM games GROUP BY team
      ), ranked AS (
        SELECT team,
          ROW_NUMBER() OVER (ORDER BY pts DESC, gd DESC, gf_total DESC) AS rn
        FROM standing
      )
      SELECT
        MAX(team) FILTER (WHERE rn = 1),
        MAX(team) FILTER (WHERE rn = 2)
        INTO v_winner, v_runner
      FROM ranked;

      UPDATE public.wc_fixtures SET home_team = v_winner WHERE home_seed = '1'||NEW.group_label;
      UPDATE public.wc_fixtures SET away_team = v_winner WHERE away_seed = '1'||NEW.group_label;
      UPDATE public.wc_fixtures SET home_team = v_runner WHERE home_seed = '2'||NEW.group_label;
      UPDATE public.wc_fixtures SET away_team = v_runner WHERE away_seed = '2'||NEW.group_label;
    END IF;
  ELSIF NEW.stage IN ('r32','r16','qf','sf') AND NEW.match_no IS NOT NULL THEN
    IF NEW.home_score > NEW.away_score THEN
      v_w := NEW.home_team; v_l := NEW.away_team;
    ELSIF NEW.away_score > NEW.home_score THEN
      v_w := NEW.away_team; v_l := NEW.home_team;
    ELSE
      RETURN NEW;
    END IF;
    UPDATE public.wc_fixtures SET home_team = v_w WHERE home_seed = 'W'||NEW.match_no;
    UPDATE public.wc_fixtures SET away_team = v_w WHERE away_seed = 'W'||NEW.match_no;
    UPDATE public.wc_fixtures SET home_team = v_l WHERE home_seed = 'L'||NEW.match_no;
    UPDATE public.wc_fixtures SET away_team = v_l WHERE away_seed = 'L'||NEW.match_no;
  END IF;

  RETURN NEW;
END;
$$;
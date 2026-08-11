CREATE OR REPLACE FUNCTION public.fantasy_points_for(_pos text, _started boolean, s fantasy_player_stats)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH v AS (
    SELECT
      COALESCE(s.minutes,0) AS mins,
      COALESCE(s.goals,0) AS goals,
      (
        COALESCE(s.goals,0) * (CASE WHEN _pos IN ('gk','def') THEN 6 WHEN _pos = 'mid' THEN 5 ELSE 4 END)
        + COALESCE(s.assists,0) * 3
        + (CASE WHEN COALESCE(s.goals_conceded,0) = 0 AND COALESCE(s.minutes,0) >= 60 AND _pos IN ('gk','def') THEN 4
                WHEN COALESCE(s.goals_conceded,0) = 0 AND COALESCE(s.minutes,0) >= 60 AND _pos = 'mid' THEN 1
                ELSE 0 END)
        + COALESCE(s.pens_saved,0) * 5
        - COALESCE(s.pens_missed,0) * 2
        - (CASE WHEN _pos IN ('gk','def') THEN FLOOR(COALESCE(s.goals_conceded,0) / 2.0)::int ELSE 0 END)
        - COALESCE(s.yellows,0)
        - COALESCE(s.reds,0) * 3
        - COALESCE(s.own_goals,0) * 2
        -- ESPN match report player stats
        + GREATEST(COALESCE(s.shots_on_target,0) - COALESCE(s.goals,0), 0)
        + FLOOR(COALESCE(s.shots,0) / 3.0)::int
        + FLOOR(COALESCE(s.accurate_passes,0) / 20.0)::int
        + FLOOR(COALESCE(s.accurate_long_balls,0) / 3.0)::int
        + COALESCE(s.big_chances_created,0) * 3
        - COALESCE(s.big_chances_missed,0) * 2
        + FLOOR(COALESCE(s.defensive_interventions,0) / 3.0)::int
        + FLOOR(COALESCE(s.duels_won,0) / 4.0)::int
        + FLOOR(COALESCE(s.touches,0) / 25.0)::int
        + (CASE WHEN _pos = 'gk' THEN FLOOR(COALESCE(s.saves,0) / 3.0)::int ELSE 0 END)
        + (CASE WHEN _pos = 'gk' THEN COALESCE(s.crosses_claimed,0) ELSE 0 END)
        - (CASE WHEN _pos = 'gk' THEN COALESCE(s.unclaimed_crosses,0) ELSE 0 END)
        + (CASE WHEN _pos = 'gk' THEN COALESCE(s.keeper_sweepers,0) ELSE 0 END)
        + (CASE WHEN _pos = 'gk' THEN FLOOR(GREATEST(COALESCE(s.shots_on_goal_against,0), COALESCE(s.shots_faced,0)) / 5.0)::int ELSE 0 END)
        + FLOOR(COALESCE(s.fouls_suffered,0) / 3.0)::int
        - FLOOR(COALESCE(s.fouls_committed,0) / 3.0)::int
        - FLOOR(COALESCE(s.offsides,0) / 2.0)::int
        + COALESCE(s.bonus,0)
      ) AS stat_pts
  )
  SELECT CASE WHEN v.mins <= 0 THEN 0 ELSE
    (CASE WHEN COALESCE(_started, true) THEN 2 ELSE 1 END)
    + (CASE WHEN COALESCE(_started, true) THEN v.stat_pts ELSE ROUND(v.stat_pts / 2.0)::int END)
  END
  FROM v;
$function$;
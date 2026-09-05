CREATE UNIQUE INDEX IF NOT EXISTS boro_fixtures_league_unique
  ON public.boro_fixtures (competition, home_team, away_team)
  WHERE competition = 'Championship';
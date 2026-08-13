CREATE TABLE public.boro_team_sheets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fixture_id uuid REFERENCES public.boro_fixtures(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.forum_topics(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.forum_posts(id) ON DELETE SET NULL,
  tweet_id text,
  image_url text NOT NULL,
  caption text,
  source_url text,
  status text NOT NULL DEFAULT 'posted',
  is_update boolean NOT NULL DEFAULT false,
  posted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX boro_team_sheets_fixture_tweet_uidx
  ON public.boro_team_sheets (fixture_id, tweet_id)
  WHERE tweet_id IS NOT NULL;
CREATE INDEX boro_team_sheets_fixture_idx ON public.boro_team_sheets (fixture_id);

GRANT SELECT ON public.boro_team_sheets TO authenticated;
GRANT ALL ON public.boro_team_sheets TO service_role;

ALTER TABLE public.boro_team_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view team sheets"
  ON public.boro_team_sheets FOR SELECT TO authenticated USING (true);

CREATE TRIGGER boro_team_sheets_updated_at
  BEFORE UPDATE ON public.boro_team_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TABLE public.boro_match_event_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.boro_fixtures(id) ON DELETE CASCADE,
  topic_id uuid,
  post_id uuid,
  event_key text NOT NULL,
  kind text NOT NULL,
  clock text,
  summary text NOT NULL,
  fingerprint text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, event_key)
);

GRANT SELECT ON public.boro_match_event_posts TO authenticated;
GRANT ALL ON public.boro_match_event_posts TO service_role;

ALTER TABLE public.boro_match_event_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view match event posts"
ON public.boro_match_event_posts
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
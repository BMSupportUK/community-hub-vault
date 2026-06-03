
CREATE TABLE public.boro_match_centre (
  id text PRIMARY KEY DEFAULT 'singleton',
  last_result jsonb,
  next_fixture jsonb,
  league_position jsonb,
  last_result_manual boolean NOT NULL DEFAULT false,
  next_fixture_manual boolean NOT NULL DEFAULT false,
  league_position_manual boolean NOT NULL DEFAULT false,
  fetched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT boro_match_centre_singleton CHECK (id = 'singleton')
);

GRANT SELECT ON public.boro_match_centre TO authenticated;
GRANT ALL ON public.boro_match_centre TO service_role;

ALTER TABLE public.boro_match_centre ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read match centre"
  ON public.boro_match_centre FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage match centre"
  ON public.boro_match_centre FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

INSERT INTO public.boro_match_centre (id) VALUES ('singleton') ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.boro_match_centre_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER boro_match_centre_set_updated_at
  BEFORE UPDATE ON public.boro_match_centre
  FOR EACH ROW EXECUTE FUNCTION public.boro_match_centre_touch();

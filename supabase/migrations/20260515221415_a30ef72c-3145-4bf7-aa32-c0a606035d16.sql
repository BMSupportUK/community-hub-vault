
-- Hero boxes table
CREATE TABLE public.hero_boxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  position SMALLINT NOT NULL UNIQUE CHECK (position BETWEEN 0 AND 2),
  icon_url TEXT,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.hero_boxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Hero boxes are viewable by everyone"
  ON public.hero_boxes FOR SELECT
  USING (true);

CREATE POLICY "Admins/management can insert hero boxes"
  ON public.hero_boxes FOR INSERT
  TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins/management can update hero boxes"
  ON public.hero_boxes FOR UPDATE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE POLICY "Admins/management can delete hero boxes"
  ON public.hero_boxes FOR DELETE
  TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

CREATE TRIGGER hero_boxes_set_updated_at
  BEFORE UPDATE ON public.hero_boxes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed defaults
INSERT INTO public.hero_boxes (position, title, description) VALUES
  (0, 'Community Channels', 'Real-time chat, voice, and announcements all in one place.'),
  (1, 'Schedules & Time-off', 'Manage shifts, swap requests, and holidays effortlessly.'),
  (2, 'Support & Services', 'Open tickets and explore our subscriber-only services.');

-- Storage bucket for icon uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('hero-box-icons', 'hero-box-icons', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Hero box icons are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'hero-box-icons');

CREATE POLICY "Admins/management can upload hero box icons"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hero-box-icons'
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE POLICY "Admins/management can update hero box icons"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hero-box-icons'
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

CREATE POLICY "Admins/management can delete hero box icons"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hero-box-icons'
    AND public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
  );

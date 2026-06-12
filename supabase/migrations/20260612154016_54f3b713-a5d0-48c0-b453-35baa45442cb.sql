
CREATE TABLE public.app_demos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  app_name TEXT,
  video_path TEXT NOT NULL,
  poster_path TEXT,
  sort_order INT NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_demos TO authenticated;
GRANT ALL ON public.app_demos TO service_role;

ALTER TABLE public.app_demos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view active demos"
  ON public.app_demos FOR SELECT
  TO authenticated
  USING (is_active OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE POLICY "Admins manage demos insert"
  ON public.app_demos FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE POLICY "Admins manage demos update"
  ON public.app_demos FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE POLICY "Admins manage demos delete"
  ON public.app_demos FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));

CREATE TRIGGER update_app_demos_updated_at
  BEFORE UPDATE ON public.app_demos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies for app-demos bucket
CREATE POLICY "Auth can view app-demos files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'app-demos');

CREATE POLICY "Admins upload app-demos files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'app-demos'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  );

CREATE POLICY "Admins update app-demos files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'app-demos'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  );

CREATE POLICY "Admins delete app-demos files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'app-demos'
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  );

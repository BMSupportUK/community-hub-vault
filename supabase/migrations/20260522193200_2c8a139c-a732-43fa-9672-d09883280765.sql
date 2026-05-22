
CREATE TABLE public.about_us_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  section_key TEXT NOT NULL UNIQUE,
  heading TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID
);

ALTER TABLE public.about_us_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "About us is public"
  ON public.about_us_content FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage about us"
  ON public.about_us_content FOR ALL
  TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), ARRAY['admin'::app_role, 'management'::app_role]));

CREATE TRIGGER about_us_content_set_updated_at
  BEFORE UPDATE ON public.about_us_content
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Business hours public anon"
  ON public.business_hours FOR SELECT
  TO anon
  USING (true);

DROP POLICY IF EXISTS "business_hours read approved" ON public.business_hours;
CREATE POLICY "Business hours public auth"
  ON public.business_hours FOR SELECT
  TO authenticated
  USING (true);

INSERT INTO public.about_us_content (section_key, heading, body, sort_order) VALUES
('intro', 'About BM Support',
'BM Support is a Middlesbrough-based team providing digital access support packages to customers across the UK and overseas. We help individuals and small businesses get reliable, secure access to the online services and tools they depend on every day.',
1),
('what_we_sell', 'What we sell',
'We sell tiered digital access support packages. Each package bundles ongoing technical support, secure account access, account setup help, and priority response times. Starter is ideal for casual users, Standard suits regular users who want faster turnaround, and Premium gives priority support with extended cover. Sign up to view the full feature list and pricing inside your account.',
2),
('our_promise', 'Our promise',
'Local people, real conversations, no bots. We pride ourselves on clear communication, fair pricing, and treating every customer''s account with care. Whether you are around the corner in Middlesbrough or based overseas, you get the same dedicated service.',
3);

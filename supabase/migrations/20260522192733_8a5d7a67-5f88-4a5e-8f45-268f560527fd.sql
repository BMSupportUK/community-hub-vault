
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TABLE public.packages_tiers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  features TEXT[] NOT NULL DEFAULT '{}',
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.packages_tiers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view tiers" ON public.packages_tiers FOR SELECT USING (true);
CREATE POLICY "Admins/mgmt insert tiers" ON public.packages_tiers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "Admins/mgmt update tiers" ON public.packages_tiers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "Admins/mgmt delete tiers" ON public.packages_tiers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE TRIGGER trg_packages_tiers_updated BEFORE UPDATE ON public.packages_tiers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE TABLE public.packages_faqs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.packages_faqs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view faqs" ON public.packages_faqs FOR SELECT USING (true);
CREATE POLICY "Admins/mgmt insert faqs" ON public.packages_faqs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "Admins/mgmt update faqs" ON public.packages_faqs FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE POLICY "Admins/mgmt delete faqs" ON public.packages_faqs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'management'));
CREATE TRIGGER trg_packages_faqs_updated BEFORE UPDATE ON public.packages_faqs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

INSERT INTO public.packages_tiers (name, tagline, features, featured, sort_order) VALUES
  ('Starter','For individuals trying our support out',
   ARRAY['Single account access','Standard local support hours','Email assistance','Getting-started guidance'],false,1),
  ('Standard','Our most popular package',
   ARRAY['Multi-device household access','Priority support response','Setup help by a Middlesbrough-based agent','Ongoing account maintenance'],true,2),
  ('Premium','Full-service for power users',
   ARRAY['Highest access tier available','Fastest support response','Dedicated local point of contact','Advanced configuration & tuning'],false,3);

INSERT INTO public.packages_faqs (question, answer, sort_order) VALUES
  ('Where are you based?','We''re based in Middlesbrough and serve customers across the North East and the wider UK.',1),
  ('Why aren''t prices shown on this page?','Our packages are tailored to each customer''s setup. Sign up for a free account to view full pricing inside your dashboard, or contact us for a personalised quote.',2),
  ('What is included in a support package?','Each package bundles digital access with hands-on UK-based support — setup help, ongoing assistance, and account management from a real person.',3),
  ('Do you offer support outside Middlesbrough?','Yes. While we''re proudly Middlesbrough-based, we support customers right across the UK remotely.',4),
  ('How do I get started?','Request access via the sign-up page. Once approved, you''ll see all available packages and pricing inside your account.',5),
  ('Is my account secure?','Yes. Accounts use secure authentication, encrypted storage, and role-based access controls.',6),
  ('Can I upgrade my package later?','Absolutely. You can move between Starter, Standard, and Premium at any time from inside your account.',7),
  ('Do you offer business or multi-user packages?','Yes. The Premium tier supports advanced multi-user setups. Contact us to discuss specific business requirements.',8),
  ('How quickly will I hear back if I contact support?','Response times vary by tier — Standard and Premium customers receive priority handling during UK business hours.',9),
  ('What payment methods do you accept?','We accept all major payment methods. Crypto (USDT) is also available for those who prefer it.',10);

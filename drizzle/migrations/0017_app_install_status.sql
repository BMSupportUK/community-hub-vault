CREATE TABLE public.app_installs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  device text NOT NULL DEFAULT 'Unknown device',
  platform text NOT NULL DEFAULT 'android',
  app_version text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device)
);
GRANT SELECT ON public.app_installs TO authenticated;
GRANT ALL ON public.app_installs TO service_role;
ALTER TABLE public.app_installs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read own installs" ON public.app_installs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Staff read all installs" ON public.app_installs
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')
  );

ALTER TABLE public.app_transfers ADD COLUMN installed_at timestamptz;
ALTER TABLE public.app_transfers ADD COLUMN install_device text;
ALTER TABLE public.app_transfers ADD COLUMN install_app_version text;
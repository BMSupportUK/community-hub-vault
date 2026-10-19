CREATE TABLE public.notification_channel_prefs (
  user_id uuid NOT NULL,
  category text NOT NULL,
  browser boolean NOT NULL DEFAULT true,
  phone boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channel_prefs TO authenticated;
GRANT ALL ON public.notification_channel_prefs TO service_role;
ALTER TABLE public.notification_channel_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own prefs select" ON public.notification_channel_prefs FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Own prefs insert" ON public.notification_channel_prefs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own prefs update" ON public.notification_channel_prefs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Own prefs delete" ON public.notification_channel_prefs FOR DELETE TO authenticated USING (user_id = auth.uid());
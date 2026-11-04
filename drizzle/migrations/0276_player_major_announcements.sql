CREATE TABLE public.player_major_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 4000),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.player_major_announcements TO authenticated;
GRANT ALL ON public.player_major_announcements TO service_role;
ALTER TABLE public.player_major_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read major announcements" ON public.player_major_announcements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "Admin and management post major announcements" ON public.player_major_announcements FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')) AND created_by = auth.uid());
CREATE POLICY "Admin and management remove major announcements" ON public.player_major_announcements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE INDEX player_major_announcements_active_idx ON public.player_major_announcements (created_at DESC) WHERE active;
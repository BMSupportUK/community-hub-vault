CREATE TABLE public.player_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message text NOT NULL CHECK (char_length(btrim(message)) BETWEEN 1 AND 300),
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
GRANT SELECT, INSERT, UPDATE ON public.player_announcements TO authenticated;
GRANT ALL ON public.player_announcements TO service_role;
ALTER TABLE public.player_announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin and management read player announcements" ON public.player_announcements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE POLICY "Admin and management send player announcements" ON public.player_announcements FOR INSERT TO authenticated
  WITH CHECK ((public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management')) AND created_by = auth.uid());
CREATE POLICY "Admin and management end player announcements" ON public.player_announcements FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));
CREATE INDEX player_announcements_active_idx ON public.player_announcements (created_at DESC) WHERE active;
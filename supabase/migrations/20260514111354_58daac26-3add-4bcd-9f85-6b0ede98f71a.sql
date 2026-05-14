-- ============ PAGE PERMISSIONS ============
CREATE TABLE IF NOT EXISTS public.page_permissions (
  page_key text PRIMARY KEY,
  label text NOT NULL,
  allowed_roles app_role[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.page_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_perms read" ON public.page_permissions;
CREATE POLICY "page_perms read" ON public.page_permissions FOR SELECT USING (true);

DROP POLICY IF EXISTS "page_perms admin write" ON public.page_permissions;
CREATE POLICY "page_perms admin write" ON public.page_permissions FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

INSERT INTO public.page_permissions (page_key, label, allowed_roles, sort_order) VALUES
  ('home','Home',ARRAY['admin','management','moderator','staff','member']::app_role[],10),
  ('profile','My profile',ARRAY['admin','management','moderator','staff','member']::app_role[],20),
  ('tickets','Tickets',ARRAY['admin','management','moderator','staff','member']::app_role[],30),
  ('shop','Shop',ARRAY['admin','management','moderator','staff','member']::app_role[],40),
  ('install-guides','Install guides',ARRAY['admin','management','moderator','staff','member']::app_role[],50),
  ('sports-guides','Sports guides',ARRAY['admin','management','moderator','staff','member']::app_role[],60),
  ('status','System status',ARRAY['admin','management','moderator','staff','member']::app_role[],70),
  ('clock','Clock',ARRAY['admin','management','moderator','staff']::app_role[],80),
  ('shifts','Shifts',ARRAY['admin','management','moderator','staff']::app_role[],90),
  ('moderation','Moderation',ARRAY['admin','management','moderator']::app_role[],100),
  ('admin','Admin dashboard',ARRAY['admin','management']::app_role[],110),
  ('admin-roles','User roles',ARRAY['admin','management']::app_role[],120),
  ('admin-credentials','Credentials',ARRAY['admin','management']::app_role[],130),
  ('admin-dns','QD DNS codes',ARRAY['admin','management']::app_role[],140),
  ('members','Members',ARRAY['admin','management','moderator','staff','member']::app_role[],150)
ON CONFLICT (page_key) DO NOTHING;

-- ============ CHANNEL PERMISSIONS ============
CREATE TABLE IF NOT EXISTS public.channel_permissions (
  channel_id uuid NOT NULL REFERENCES public.chat_channels(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_send boolean NOT NULL DEFAULT true,
  can_delete boolean NOT NULL DEFAULT false,
  can_mention boolean NOT NULL DEFAULT false,
  PRIMARY KEY (channel_id, role)
);
ALTER TABLE public.channel_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chan_perms read" ON public.channel_permissions;
CREATE POLICY "chan_perms read" ON public.channel_permissions FOR SELECT
  USING (NOT public.has_role(auth.uid(),'pending'::app_role) AND NOT public.has_role(auth.uid(),'banned'::app_role));

DROP POLICY IF EXISTS "chan_perms admin write" ON public.channel_permissions;
CREATE POLICY "chan_perms admin write" ON public.channel_permissions FOR ALL
  USING (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[]));

-- Seed defaults for every existing channel x role
INSERT INTO public.channel_permissions (channel_id, role, can_view, can_send, can_delete, can_mention)
SELECT c.id, r.role,
  CASE WHEN c.staff_only THEN r.role IN ('admin','management','moderator','staff') ELSE r.role NOT IN ('pending','banned') END,
  CASE WHEN c.staff_only THEN r.role IN ('admin','management','moderator','staff') ELSE r.role NOT IN ('pending','banned') END,
  r.role IN ('admin','management','moderator'),
  r.role IN ('admin','management')
FROM public.chat_channels c
CROSS JOIN (SELECT unnest(enum_range(NULL::app_role)) AS role) r
ON CONFLICT (channel_id, role) DO NOTHING;

-- Helper: can a user perform an action in a channel
CREATE OR REPLACE FUNCTION public.can_in_channel(_user uuid, _channel uuid, _action text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.has_any_role(_user, ARRAY['admin','management']::app_role[])
    OR EXISTS (
      SELECT 1 FROM public.channel_permissions cp
      JOIN public.user_roles ur ON ur.role = cp.role
      WHERE cp.channel_id = _channel AND ur.user_id = _user
        AND (
          (_action='view' AND cp.can_view) OR
          (_action='send' AND cp.can_send) OR
          (_action='delete' AND cp.can_delete) OR
          (_action='mention' AND cp.can_mention)
        )
    );
$$;

-- Update chat RLS to use the helper
DROP POLICY IF EXISTS "channels read approved" ON public.chat_channels;
CREATE POLICY "channels read approved" ON public.chat_channels FOR SELECT TO authenticated
  USING (
    NOT public.has_role(auth.uid(),'pending'::app_role)
    AND NOT public.has_role(auth.uid(),'banned'::app_role)
    AND public.can_in_channel(auth.uid(), id, 'view')
  );

DROP POLICY IF EXISTS "messages read channel" ON public.chat_messages;
CREATE POLICY "messages read channel" ON public.chat_messages FOR SELECT TO authenticated
  USING (public.can_in_channel(auth.uid(), channel_id, 'view'));

DROP POLICY IF EXISTS "messages insert self" ON public.chat_messages;
CREATE POLICY "messages insert self" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND NOT public.has_role(auth.uid(),'pending'::app_role)
    AND NOT public.has_role(auth.uid(),'banned'::app_role)
    AND public.can_in_channel(auth.uid(), channel_id, 'send')
  );

DROP POLICY IF EXISTS "messages delete own or admin" ON public.chat_messages;
CREATE POLICY "messages delete own or admin" ON public.chat_messages FOR DELETE TO authenticated
  USING (
    sender_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin','management']::app_role[])
    OR public.can_in_channel(auth.uid(), channel_id, 'delete')
  );

-- Update mention trigger to honour can_mention
CREATE OR REPLACE FUNCTION public.validate_mention_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.content ~* '(^|\s)@(all|here)\b') THEN
    IF NOT (
      public.has_any_role(NEW.sender_id, ARRAY['admin','management']::app_role[])
      OR public.can_in_channel(NEW.sender_id, NEW.channel_id, 'mention')
    ) THEN
      RAISE EXCEPTION 'You do not have permission to use @all or @here in this channel';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Auto-seed channel_permissions when new channels are created
CREATE OR REPLACE FUNCTION public.seed_channel_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.channel_permissions (channel_id, role, can_view, can_send, can_delete, can_mention)
  SELECT NEW.id, r.role,
    CASE WHEN NEW.staff_only THEN r.role IN ('admin','management','moderator','staff') ELSE r.role NOT IN ('pending','banned') END,
    CASE WHEN NEW.staff_only THEN r.role IN ('admin','management','moderator','staff') ELSE r.role NOT IN ('pending','banned') END,
    r.role IN ('admin','management','moderator'),
    r.role IN ('admin','management')
  FROM (SELECT unnest(enum_range(NULL::app_role)) AS role) r
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_seed_channel_permissions ON public.chat_channels;
CREATE TRIGGER trg_seed_channel_permissions
AFTER INSERT ON public.chat_channels
FOR EACH ROW EXECUTE FUNCTION public.seed_channel_permissions();

ALTER PUBLICATION supabase_realtime ADD TABLE public.page_permissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.channel_permissions;
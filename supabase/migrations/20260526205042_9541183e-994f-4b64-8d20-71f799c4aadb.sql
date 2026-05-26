
CREATE TYPE public.fan_zone_status AS ENUM ('pending','approved','rejected','revoked');

CREATE TABLE public.fan_zone_members (
  user_id      uuid PRIMARY KEY,
  status       public.fan_zone_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_at   timestamptz NULL,
  decided_by   uuid NULL,
  reason       text NULL,
  note         text NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fan_zone_members TO authenticated;
GRANT ALL ON public.fan_zone_members TO service_role;

ALTER TABLE public.fan_zone_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fan_zone read own or admin"
  ON public.fan_zone_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE POLICY "fan_zone insert self pending"
  ON public.fan_zone_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND NOT public.has_role(auth.uid(), 'pending'::app_role)
    AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  );

CREATE POLICY "fan_zone admin manage"
  ON public.fan_zone_members FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

CREATE TRIGGER fan_zone_members_updated_at
  BEFORE UPDATE ON public.fan_zone_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.chat_channels
  ADD COLUMN requires_fan_zone boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.is_fan_zone_member(_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.fan_zone_members
    WHERE user_id = _user AND status = 'approved'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_in_channel(_user uuid, _channel uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_any_role(_user, ARRAY['admin','management']::app_role[])
    OR (
      EXISTS (
        SELECT 1 FROM public.channel_permissions cp
        JOIN public.user_roles ur ON ur.role = cp.role
        WHERE cp.channel_id = _channel AND ur.user_id = _user
          AND (
            (_action='view' AND cp.can_view) OR
            (_action='send' AND cp.can_send) OR
            (_action='delete' AND cp.can_delete) OR
            (_action='mention' AND cp.can_mention)
          )
      )
      AND COALESCE(
        (SELECT NOT requires_fan_zone OR public.is_fan_zone_member(_user)
         FROM public.chat_channels WHERE id = _channel),
        true
      )
    );
$$;

DO $$
DECLARE
  ch_id uuid;
  ch RECORD;
  perm record;
BEGIN
  FOR ch IN
    SELECT * FROM (VALUES
      ('boro-general',     'General',          'Hash',     200, 30),
      ('match-day',        'Match Day',        'Trophy',   210, 5),
      ('transfers-rumours','Transfers & Rumours','Megaphone',220, 30),
      ('highlights',       'Highlights',       'Star',     230, 30),
      ('fixtures-results', 'Fixtures & Results','Calendar', 240, 30)
    ) AS t(slug, name, icon, sort_order, slow_mode_seconds)
  LOOP
    INSERT INTO public.chat_channels (slug, name, group_label, icon, staff_only, sort_order, slow_mode_seconds, requires_fan_zone)
    VALUES (ch.slug, ch.name, 'Boro Fan Zone', ch.icon, false, ch.sort_order, ch.slow_mode_seconds, true)
    ON CONFLICT (slug) DO UPDATE
      SET group_label = EXCLUDED.group_label,
          requires_fan_zone = true
    RETURNING id INTO ch_id;

    FOR perm IN
      SELECT * FROM (VALUES
        ('admin'::app_role,      true, true, true, true),
        ('management'::app_role, true, true, true, true),
        ('moderator'::app_role,  true, true, true, false),
        ('staff'::app_role,      true, true, true, false),
        ('subscriber'::app_role, true, true, false, false),
        ('member'::app_role,     true, true, false, false),
        ('pending'::app_role,    false, false, false, false),
        ('banned'::app_role,     false, false, false, false)
      ) AS p(role, can_view, can_send, can_delete, can_mention)
    LOOP
      INSERT INTO public.channel_permissions (channel_id, role, can_view, can_send, can_delete, can_mention)
      VALUES (ch_id, perm.role, perm.can_view, perm.can_send, perm.can_delete, perm.can_mention)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

INSERT INTO public.app_settings (key, value)
VALUES ('category_icons', jsonb_build_object('Boro Fan Zone', 'Trophy'))
ON CONFLICT (key) DO UPDATE
  SET value = COALESCE(public.app_settings.value, '{}'::jsonb) || jsonb_build_object('Boro Fan Zone', 'Trophy');

UPDATE public.app_settings
SET value = jsonb_set(
  value,
  '{labels}',
  COALESCE(value->'labels', '[]'::jsonb) || '["Boro Fan Zone"]'::jsonb
)
WHERE key = 'category_order'
  AND NOT (COALESCE(value->'labels','[]'::jsonb) @> '["Boro Fan Zone"]'::jsonb);

ALTER PUBLICATION supabase_realtime ADD TABLE public.fan_zone_members;

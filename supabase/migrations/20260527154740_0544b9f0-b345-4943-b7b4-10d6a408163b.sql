
-- Register the role so it shows up in the Roles admin UI
INSERT INTO public.role_definitions (name, label, is_system, sort_order, is_active)
VALUES ('boro_fan_zone_moderator', 'Boro Fan Zone Moderator', false, 50, true)
ON CONFLICT (name) DO UPDATE
  SET label = EXCLUDED.label, is_active = true;

-- Forum moderator check: treat boro_fan_zone_moderator as a forum moderator
CREATE OR REPLACE FUNCTION public.is_forum_moderator(_user uuid, _board uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(_user, ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[])
    OR EXISTS (SELECT 1 FROM public.forum_board_moderators WHERE board_id = _board AND user_id = _user);
$$;

-- Forum board access: boro_fan_zone_moderator bypasses per-board permission rows just like other moderators
CREATE OR REPLACE FUNCTION public.forum_board_allows(_user uuid, _board uuid, _action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_config boolean;
BEGIN
  IF public.has_any_role(_user, ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[]) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.forum_board_moderators
             WHERE board_id = _board AND user_id = _user) THEN
    RETURN true;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.forum_board_permissions WHERE board_id = _board)
    INTO v_has_config;

  IF v_has_config THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.forum_board_permissions p
      JOIN public.user_roles ur ON ur.role = p.role
      WHERE p.board_id = _board
        AND ur.user_id = _user
        AND CASE _action
              WHEN 'view'         THEN p.can_view
              WHEN 'create_topic' THEN p.can_create_topic
              WHEN 'reply'        THEN p.can_reply
              ELSE false
            END
    );
  END IF;

  RETURN public.is_fan_zone_member(_user)
      OR public.has_any_role(_user, ARRAY['staff']::app_role[]);
END
$$;

-- View counter: allow the new role to increment views in the fan zone
CREATE OR REPLACE FUNCTION public.forum_increment_view(_topic uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.is_fan_zone_member(auth.uid())
    OR public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','boro_fan_zone_moderator']::app_role[])
  ) THEN
    RETURN;
  END IF;
  UPDATE public.forum_topics SET view_count = view_count + 1 WHERE id = _topic;
END
$$;

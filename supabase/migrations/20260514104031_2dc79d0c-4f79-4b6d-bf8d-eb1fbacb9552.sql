
-- Extend chat mention trigger to also notify users when a role is tagged (e.g. @admin, @staff)
CREATE OR REPLACE FUNCTION public.process_chat_mentions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ch_name text; ch_slug text; ch_staff boolean;
  sender_name text;
  mention_match text;
  mentioned_user_id uuid;
  is_all boolean; is_here boolean;
  role_exists boolean;
  is_system_role boolean;
BEGIN
  SELECT name, slug, staff_only INTO ch_name, ch_slug, ch_staff FROM public.chat_channels WHERE id = NEW.channel_id;
  SELECT COALESCE(display_name, username, 'Someone') INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;

  is_all := NEW.content ~* '(^|\s)@all\b';
  is_here := NEW.content ~* '(^|\s)@here\b';

  IF is_all OR is_here THEN
    INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
    SELECT p.id, 'mention',
      sender_name || ' mentioned ' || (CASE WHEN is_all THEN '@all' ELSE '@here' END) || ' in #' || ch_name,
      LEFT(NEW.content, 200),
      '/home/' || ch_slug,
      'chat', NEW.id
    FROM public.profiles p
    WHERE p.id <> NEW.sender_id
      AND NOT public.has_role(p.id, 'pending'::app_role)
      AND NOT public.has_role(p.id, 'banned'::app_role)
      AND (ch_staff = false OR public.has_any_role(p.id, ARRAY['admin','management','moderator','staff']::app_role[]));
  END IF;

  FOR mention_match IN
    SELECT (regexp_matches(NEW.content, '@([a-zA-Z0-9_\.\-]+)', 'g'))[1]
  LOOP
    IF lower(mention_match) IN ('all','here') THEN CONTINUE; END IF;

    -- Role mention: token matches an app_role enum label (e.g. @admin, @staff, @member)
    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'app_role' AND e.enumlabel = lower(mention_match)
    ) INTO role_exists;

    IF role_exists AND lower(mention_match) NOT IN ('pending','banned') THEN
      is_system_role := lower(mention_match) IN ('admin','management','moderator','staff');
      -- Skip role-mention in staff-only channel for non-staff roles to avoid leaking
      IF ch_staff = false OR is_system_role THEN
        INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
        SELECT DISTINCT ur.user_id, 'mention',
          sender_name || ' mentioned @' || lower(mention_match) || ' in #' || ch_name,
          LEFT(NEW.content, 200),
          '/home/' || ch_slug,
          'chat', NEW.id
        FROM public.user_roles ur
        WHERE ur.role::text = lower(mention_match)
          AND ur.user_id <> NEW.sender_id
          AND NOT public.has_role(ur.user_id, 'pending'::app_role)
          AND NOT public.has_role(ur.user_id, 'banned'::app_role);
      END IF;
      CONTINUE;
    END IF;

    -- Username mention
    SELECT id INTO mentioned_user_id FROM public.profiles WHERE lower(username) = lower(mention_match) LIMIT 1;
    IF mentioned_user_id IS NOT NULL AND mentioned_user_id <> NEW.sender_id THEN
      IF public.has_role(mentioned_user_id, 'pending'::app_role) OR public.has_role(mentioned_user_id, 'banned'::app_role) THEN CONTINUE; END IF;
      IF ch_staff AND NOT public.has_any_role(mentioned_user_id, ARRAY['admin','management','moderator','staff']::app_role[]) THEN CONTINUE; END IF;
      INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
      VALUES (mentioned_user_id, 'mention',
        sender_name || ' mentioned you in #' || ch_name,
        LEFT(NEW.content, 200),
        '/home/' || ch_slug,
        'chat', NEW.id);
    END IF;
  END LOOP;

  RETURN NEW;
END $function$;

-- Same extension for ticket mentions (staff-side roles only since ticket threads are staff-internal)
CREATE OR REPLACE FUNCTION public.process_ticket_mentions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  t_subject text; t_owner uuid;
  sender_name text;
  mention_match text;
  mentioned_user_id uuid;
  is_all boolean; is_here boolean;
  role_exists boolean;
BEGIN
  SELECT subject, user_id INTO t_subject, t_owner FROM public.tickets WHERE id = NEW.ticket_id;
  SELECT COALESCE(display_name, username, 'Someone') INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;

  is_all := NEW.content ~* '(^|\s)@all\b';
  is_here := NEW.content ~* '(^|\s)@here\b';

  IF is_all OR is_here THEN
    INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
    SELECT DISTINCT ur.user_id, 'mention',
      sender_name || ' mentioned ' || (CASE WHEN is_all THEN '@all' ELSE '@here' END) || ' on ticket: ' || t_subject,
      LEFT(NEW.content, 200),
      '/tickets?id=' || NEW.ticket_id::text,
      'ticket', NEW.id
    FROM public.user_roles ur
    WHERE ur.role IN ('admin','management','staff','moderator')
      AND ur.user_id <> NEW.sender_id;
  END IF;

  FOR mention_match IN
    SELECT (regexp_matches(NEW.content, '@([a-zA-Z0-9_\.\-]+)', 'g'))[1]
  LOOP
    IF lower(mention_match) IN ('all','here') THEN CONTINUE; END IF;

    SELECT EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'app_role' AND e.enumlabel = lower(mention_match)
    ) INTO role_exists;

    IF role_exists AND lower(mention_match) IN ('admin','management','moderator','staff') THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
      SELECT DISTINCT ur.user_id, 'mention',
        sender_name || ' mentioned @' || lower(mention_match) || ' on ticket: ' || t_subject,
        LEFT(NEW.content, 200),
        '/tickets?id=' || NEW.ticket_id::text,
        'ticket', NEW.id
      FROM public.user_roles ur
      WHERE ur.role::text = lower(mention_match)
        AND ur.user_id <> NEW.sender_id;
      CONTINUE;
    END IF;

    SELECT id INTO mentioned_user_id FROM public.profiles WHERE lower(username) = lower(mention_match) LIMIT 1;
    IF mentioned_user_id IS NULL OR mentioned_user_id = NEW.sender_id THEN CONTINUE; END IF;
    IF NEW.is_internal AND NOT public.has_any_role(mentioned_user_id, ARRAY['admin','management','staff','moderator']::app_role[]) THEN CONTINUE; END IF;
    IF NOT NEW.is_internal AND mentioned_user_id <> t_owner AND NOT public.has_any_role(mentioned_user_id, ARRAY['admin','management','staff','moderator']::app_role[]) THEN CONTINUE; END IF;
    INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
    VALUES (mentioned_user_id, 'mention',
      sender_name || ' mentioned you on ticket: ' || t_subject,
      LEFT(NEW.content, 200),
      '/tickets?id=' || NEW.ticket_id::text,
      'ticket', NEW.id);
  END LOOP;

  RETURN NEW;
END $function$;

-- Allow @all/@here permission gate to also accept role mentions (no extra perms needed).
-- The validate_mention_permissions trigger only restricts @all/@here, role tags are open.

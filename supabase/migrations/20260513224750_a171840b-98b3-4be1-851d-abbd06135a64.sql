-- 1. user_notifications table
CREATE TABLE public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null,
  title text not null,
  body text,
  link_path text,
  source_type text,
  source_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_notif read own" ON public.user_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "user_notif update own" ON public.user_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "user_notif no direct insert" ON public.user_notifications
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "user_notif delete own" ON public.user_notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX user_notif_user_idx ON public.user_notifications(user_id, created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;

-- 2. Validate @all / @here permission
CREATE OR REPLACE FUNCTION public.validate_mention_permissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.content ~* '(^|\s)@(all|here)\b') THEN
    IF NOT public.has_any_role(NEW.sender_id, ARRAY['admin','management']::app_role[]) THEN
      RAISE EXCEPTION 'Only admin and management can use @all or @here';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER chat_validate_mentions
  BEFORE INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_mention_permissions();

CREATE TRIGGER ticket_validate_mentions
  BEFORE INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.validate_mention_permissions();

-- 3. Process chat mentions
CREATE OR REPLACE FUNCTION public.process_chat_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ch_name text; ch_slug text; ch_staff boolean;
  sender_name text;
  mention_match text;
  mentioned_user_id uuid;
  is_all boolean; is_here boolean;
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
END $$;

CREATE TRIGGER chat_process_mentions
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.process_chat_mentions();

-- 4. Process ticket mentions
CREATE OR REPLACE FUNCTION public.process_ticket_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t_subject text; t_owner uuid;
  sender_name text;
  mention_match text;
  mentioned_user_id uuid;
  is_all boolean; is_here boolean;
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
END $$;

CREATE TRIGGER ticket_process_mentions
  AFTER INSERT ON public.ticket_messages
  FOR EACH ROW EXECUTE FUNCTION public.process_ticket_mentions();
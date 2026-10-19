CREATE OR REPLACE FUNCTION public.process_inbox_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE t record; sender_name text; tag text; uid uuid;
BEGIN
  SELECT user_low, user_high INTO t FROM public.bm_inbox_threads WHERE id = NEW.thread_id;
  SELECT COALESCE(display_name, username, 'Someone') INTO sender_name FROM public.profiles WHERE id = NEW.sender_id;
  FOR tag IN SELECT DISTINCT lower((regexp_matches(NEW.body, '@([a-zA-Z0-9_\.\-]+)', 'g'))[1]) LOOP
    SELECT id INTO uid FROM public.profiles WHERE lower(username) = tag LIMIT 1;
    -- Only thread participants can read the message, so only they are alerted.
    IF uid IS NOT NULL AND uid <> NEW.sender_id AND uid IN (t.user_low, t.user_high) THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
      VALUES (uid, 'mention', sender_name || ' tagged you in the inbox', LEFT(NEW.body, 200), '/inbox', 'inbox', NEW.id);
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bm_inbox_messages_mentions ON public.bm_inbox_messages;
CREATE TRIGGER bm_inbox_messages_mentions AFTER INSERT ON public.bm_inbox_messages
FOR EACH ROW EXECUTE FUNCTION public.process_inbox_mentions();

CREATE OR REPLACE FUNCTION public.process_checkout_chat_mentions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sender_name text; tag text; uid uuid;
BEGIN
  IF NEW.sender = 'staff' AND NEW.staff_id IS NOT NULL THEN
    SELECT COALESCE(display_name, username, 'Staff') INTO sender_name FROM public.profiles WHERE id = NEW.staff_id;
  ELSE
    sender_name := 'The customer';
  END IF;
  FOR tag IN SELECT DISTINCT lower((regexp_matches(NEW.content, '@([a-zA-Z0-9_\.\-]+)', 'g'))[1]) LOOP
    SELECT id INTO uid FROM public.profiles WHERE lower(username) = tag LIMIT 1;
    -- Order chats are staff-facing: only staff members are alerted.
    IF uid IS NOT NULL AND uid IS DISTINCT FROM NEW.staff_id
       AND public.has_any_role(uid, ARRAY['admin','management','moderator','staff']::app_role[]) THEN
      INSERT INTO public.user_notifications (user_id, kind, title, body, link_path, source_type, source_id)
      VALUES (uid, 'mention', sender_name || ' tagged you in an order chat', LEFT(NEW.content, 200),
              '/admin-secure-page?order=' || NEW.order_id::text, 'checkout_chat', NEW.id);
    END IF;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS checkout_chat_messages_mentions ON public.checkout_chat_messages;
CREATE TRIGGER checkout_chat_messages_mentions AFTER INSERT ON public.checkout_chat_messages
FOR EACH ROW EXECUTE FUNCTION public.process_checkout_chat_mentions();

REVOKE EXECUTE ON FUNCTION public.process_inbox_mentions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.process_checkout_chat_mentions() FROM PUBLIC, anon, authenticated;
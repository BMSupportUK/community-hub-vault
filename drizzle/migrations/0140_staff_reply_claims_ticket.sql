CREATE OR REPLACE FUNCTION public.claim_ticket_on_staff_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_internal THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_any_role(NEW.sender_id, ARRAY['admin','management','staff','moderator']::public.app_role[]) THEN
    RETURN NEW;
  END IF;

  UPDATE public.tickets
     SET assigned_to = NEW.sender_id
   WHERE id = NEW.ticket_id
     AND assigned_to IS NULL
     AND user_id <> NEW.sender_id
     AND status IN ('open','in_progress','waiting');

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ticket_on_staff_reply() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS ticket_claim_on_staff_reply ON public.ticket_messages;
CREATE TRIGGER ticket_claim_on_staff_reply
AFTER INSERT ON public.ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.claim_ticket_on_staff_reply();

UPDATE public.tickets t
   SET assigned_to = first_reply.sender_id
  FROM (
    SELECT DISTINCT ON (m.ticket_id) m.ticket_id, m.sender_id
      FROM public.ticket_messages m
      JOIN public.tickets tk ON tk.id = m.ticket_id
     WHERE NOT m.is_internal
       AND m.sender_id <> tk.user_id
       AND public.has_any_role(m.sender_id, ARRAY['admin','management','staff','moderator']::public.app_role[])
     ORDER BY m.ticket_id, m.created_at
  ) first_reply
 WHERE t.id = first_reply.ticket_id
   AND t.assigned_to IS NULL
   AND t.archived_at IS NULL
   AND t.status IN ('open','in_progress','waiting');
CREATE OR REPLACE FUNCTION public.auto_claim_ticket_on_staff_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sender_id IS NULL OR COALESCE(NEW.is_internal, false) THEN RETURN NEW; END IF;
  IF public.has_role(NEW.sender_id, 'admin') OR public.has_role(NEW.sender_id, 'management')
     OR public.has_role(NEW.sender_id, 'staff') OR public.has_role(NEW.sender_id, 'moderator') THEN
    UPDATE public.tickets SET assigned_to = NEW.sender_id
     WHERE id = NEW.ticket_id AND assigned_to IS NULL AND user_id <> NEW.sender_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.auto_claim_ticket_on_staff_reply() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_auto_claim_ticket_on_staff_reply ON public.ticket_messages;
CREATE TRIGGER trg_auto_claim_ticket_on_staff_reply AFTER INSERT ON public.ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.auto_claim_ticket_on_staff_reply();
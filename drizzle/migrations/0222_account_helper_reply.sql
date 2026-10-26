CREATE OR REPLACE FUNCTION public.account_helper_reply(_ticket_id uuid, _choice text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; me uuid := auth.uid(); q text; a text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT tk.id, tk.user_id, tk.status, c.slug INTO t FROM tickets tk JOIN ticket_categories c ON c.id = tk.category_id WHERE tk.id = _ticket_id;
  IF t.id IS NULL OR t.user_id <> me OR t.slug <> 'account' THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF t.status = 'closed' THEN RETURN 'closed'; END IF;
  IF _choice = 'logged_in' THEN
    q := 'I found them and I''m logged in';
    a := '🔑 Login helper — Brilliant, glad you''re back in! I''ve closed this ticket for you. If you need anything else, just open a new ticket.';
  ELSIF _choice = 'cant_find' THEN
    q := 'I can''t find them';
    a := E'🔑 **Login helper**\n\nNo worries! Here''s where to look:\n\n1. Open the side menu and tap **Service Credentials** (the key icon).\n2. If the page is locked, press **Unlock** — we''ll email you a login code. Type that code in to open it.\n3. Your app username and password are listed there — tap copy and paste them into the app.\n\n🔗 [Open Service Credentials](/portal/logins)\n\nLet me know how you get on using the buttons below.';
  ELSIF _choice = 'still_stuck' THEN
    q := 'I found them but still can''t log in';
    a := '🔑 Login helper — No problem, I''ve passed this to our team. A staff member will reply here as soon as they can.';
  ELSE RAISE EXCEPTION 'Unknown choice'; END IF;
  INSERT INTO ticket_messages(ticket_id, sender_id, content, is_internal) VALUES (_ticket_id, me, q, false);
  INSERT INTO ticket_messages(ticket_id, sender_id, content, is_internal) VALUES (_ticket_id, me, a, false);
  IF _choice = 'logged_in' THEN
    UPDATE tickets SET status = 'closed', closed_at = now(), updated_at = now() WHERE id = _ticket_id;
    RETURN 'closed';
  END IF;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.account_helper_reply(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_helper_reply(uuid, text) TO authenticated;
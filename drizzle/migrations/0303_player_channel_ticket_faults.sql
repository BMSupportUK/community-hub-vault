ALTER TABLE public.tickets ADD COLUMN player_channel_name text;
ALTER TABLE public.tickets ADD COLUMN player_channel_key text;
COMMENT ON COLUMN public.tickets.player_channel_key IS 'Canonical live-channel fault identity; one unresolved ticket per channel across BM Player devices.';

CREATE OR REPLACE FUNCTION public.player_fault_channel_key(_name text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
 SELECT lower(regexp_replace(trim(normalize(coalesce(_name, ''), NFKC)), '\s+', ' ', 'g'));
$$;
REVOKE ALL ON FUNCTION public.player_fault_channel_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_fault_channel_key(text) TO authenticated, service_role;

UPDATE public.tickets SET player_channel_name = regexp_replace(subject, '^BM Player: Channel\s*[–-]\s*', ''), player_channel_key = public.player_fault_channel_key(regexp_replace(subject, '^BM Player: Channel\s*[–-]\s*', '')) WHERE subject ~ '^BM Player: Channel\s*[–-]\s*';

CREATE OR REPLACE FUNCTION public.guard_player_channel_fault() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.player_channel_name IS NULL AND NEW.subject ~ '^BM Player: Channel\s*[–-]\s*' THEN
   NEW.player_channel_name := regexp_replace(NEW.subject, '^BM Player: Channel\s*[–-]\s*', '');
 END IF;
 IF NEW.player_channel_name IS NOT NULL THEN
   NEW.player_channel_key := public.player_fault_channel_key(NEW.player_channel_name);
   IF NEW.player_channel_key = '' THEN RAISE EXCEPTION 'Choose a channel'; END IF;
   IF NEW.status NOT IN ('resolved', 'closed') THEN
     PERFORM pg_advisory_xact_lock(hashtextextended(NEW.player_channel_key, 814));
     IF EXISTS (SELECT 1 FROM public.tickets t WHERE t.player_channel_key = NEW.player_channel_key AND t.status NOT IN ('resolved', 'closed') AND t.id <> NEW.id) THEN
       RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'A fault is already reported for this channel. Please try another channel while staff investigate.';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_player_channel_fault() FROM PUBLIC;
CREATE TRIGGER guard_player_channel_fault BEFORE INSERT OR UPDATE OF status, subject, player_channel_name ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.guard_player_channel_fault();
CREATE INDEX tickets_active_player_channel_fault ON public.tickets(player_channel_key) WHERE player_channel_key IS NOT NULL AND status NOT IN ('resolved', 'closed');

CREATE OR REPLACE FUNCTION public.create_player_fault_ticket(_device_id uuid, _title text, _category text, _issue text, _device text, _version text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _cat uuid; _id uuid; _key text;
BEGIN
 SELECT user_id INTO _owner FROM public.player_devices WHERE id = _device_id;
 IF _owner IS NULL THEN RAISE EXCEPTION 'Link this app to your BM Support account first.'; END IF;
 IF length(trim(_title)) NOT BETWEEN 1 AND 200 OR length(trim(_issue)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Choose a channel and describe the problem.'; END IF;
 _key := public.player_fault_channel_key(_title);
 PERFORM pg_advisory_xact_lock(hashtextextended(_key, 814));
 IF EXISTS (SELECT 1 FROM public.tickets WHERE player_channel_key = _key AND status NOT IN ('resolved', 'closed')) THEN
   RETURN jsonb_build_object('duplicate', true);
 END IF;
 IF (SELECT count(*) FROM public.tickets WHERE user_id = _owner AND subject LIKE 'BM Player:%' AND created_at >= now() - interval '10 minutes') >= 3 THEN
   RETURN jsonb_build_object('rate_limited', true);
 END IF;
 SELECT id INTO _cat FROM public.ticket_categories WHERE slug = 'live-tv';
 IF _cat IS NULL THEN RAISE EXCEPTION 'Live TV support is unavailable'; END IF;
 INSERT INTO public.tickets(user_id, category_id, subject, priority, player_channel_name, player_channel_key)
 VALUES (_owner, _cat, left('BM Player: Channel – ' || _title, 200), 'normal', _title, _key) RETURNING id INTO _id;
 INSERT INTO public.ticket_messages(ticket_id, sender_id, is_internal, content)
 VALUES (_id, _owner, false, 'Reported from BM Player' || E'\n\nChannel: ' || _title || CASE WHEN coalesce(_category, '') <> '' THEN E'\nCategory: ' || left(_category, 120) ELSE '' END || E'\nDevice: ' || left(coalesce(_device, 'Unknown'), 80) || CASE WHEN coalesce(_version, '') <> '' THEN ' · BM Player ' || left(_version, 20) ELSE '' END || E'\n\nProblem: ' || _issue);
 RETURN jsonb_build_object('ok', true, 'ticket_id', _id);
END;
$$;
REVOKE ALL ON FUNCTION public.create_player_fault_ticket(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_player_fault_ticket(uuid,text,text,text,text,text) TO service_role;
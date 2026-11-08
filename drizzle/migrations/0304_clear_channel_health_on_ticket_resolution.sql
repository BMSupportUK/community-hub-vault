CREATE OR REPLACE FUNCTION public.clear_resolved_player_channel_fault() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cleared_at timestamptz;
BEGIN
 IF NEW.player_channel_key IS NULL OR NEW.status NOT IN ('resolved','closed') OR OLD.status IN ('resolved','closed') THEN RETURN NEW; END IF;
 _cleared_at := clock_timestamp();
 -- Advance the existing health-clear boundary, suppressing old failures and stalls
 -- without deleting history; any failure arriving after this still counts normally.
 INSERT INTO public.player_channel_health(channel_key,channel_name,last_ok_at,updated_at)
 VALUES (NEW.player_channel_key,NEW.player_channel_name,_cleared_at,_cleared_at)
 ON CONFLICT (channel_key) DO UPDATE SET last_ok_at = greatest(public.player_channel_health.last_ok_at,EXCLUDED.last_ok_at), updated_at = EXCLUDED.updated_at;
 -- Existing health keys predate Unicode/whitespace canonicalization.
 UPDATE public.player_channel_health SET last_ok_at = greatest(last_ok_at,_cleared_at), updated_at = _cleared_at
 WHERE public.player_fault_channel_key(channel_name) = NEW.player_channel_key AND channel_key <> NEW.player_channel_key;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_resolved_player_channel_fault() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER clear_resolved_player_channel_fault AFTER UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.clear_resolved_player_channel_fault();
COMMENT ON FUNCTION public.clear_resolved_player_channel_fault() IS 'Terminal channel ticket transitions advance the health-clear boundary for preceding failures/stalls; subsequent failures remain reportable.';
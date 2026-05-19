
-- chat_mutes table
CREATE TABLE public.chat_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  muted_by uuid NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX chat_mutes_user_active_idx ON public.chat_mutes(user_id, expires_at DESC);

ALTER TABLE public.chat_mutes ENABLE ROW LEVEL SECURITY;

-- Users can view their own mute records
CREATE POLICY "chat_mutes read own"
  ON public.chat_mutes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Staff/mods/admin can read all mutes
CREATE POLICY "chat_mutes read staff"
  ON public.chat_mutes FOR SELECT TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role]));

-- Staff/mods/admin can insert mutes (but not against staff/admin/mod/management)
CREATE POLICY "chat_mutes insert staff"
  ON public.chat_mutes FOR INSERT TO authenticated
  WITH CHECK (
    has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
    AND muted_by = auth.uid()
    AND user_id <> auth.uid()
    AND NOT has_any_role(user_id, ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role])
  );

-- Admin/management can delete (unmute)
CREATE POLICY "chat_mutes delete admin"
  ON public.chat_mutes FOR DELETE TO authenticated
  USING (has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_mutes;

-- Helper: returns latest active mute expiry for a user (null if not muted)
CREATE OR REPLACE FUNCTION public.get_active_mute(_user_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(expires_at)
  FROM public.chat_mutes
  WHERE user_id = _user_id
    AND expires_at > now();
$$;

-- RPC for staff to mute a user (duration in seconds: 3600, 10800, 86400)
CREATE OR REPLACE FUNCTION public.mute_user(_user_id uuid, _duration_seconds integer, _reason text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expires timestamptz;
BEGIN
  IF NOT has_any_role(auth.uid(), ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role]) THEN
    RAISE EXCEPTION 'Not authorized to mute users';
  END IF;

  IF _user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot mute yourself';
  END IF;

  IF has_any_role(_user_id, ARRAY['admin'::app_role,'management'::app_role,'moderator'::app_role,'staff'::app_role]) THEN
    RAISE EXCEPTION 'Cannot mute staff members';
  END IF;

  IF _duration_seconds NOT IN (3600, 10800, 86400) THEN
    RAISE EXCEPTION 'Invalid mute duration';
  END IF;

  _expires := now() + (_duration_seconds || ' seconds')::interval;

  INSERT INTO public.chat_mutes (user_id, muted_by, expires_at, reason)
  VALUES (_user_id, auth.uid(), _expires, _reason);

  RETURN _expires;
END;
$$;

-- Trigger on chat_messages to block muted users from sending
CREATE OR REPLACE FUNCTION public.block_muted_chat_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _expires timestamptz;
BEGIN
  SELECT MAX(expires_at) INTO _expires
  FROM public.chat_mutes
  WHERE user_id = NEW.sender_id AND expires_at > now();

  IF _expires IS NOT NULL THEN
    RAISE EXCEPTION 'You are muted until %', _expires USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER chat_messages_block_muted
BEFORE INSERT ON public.chat_messages
FOR EACH ROW EXECUTE FUNCTION public.block_muted_chat_insert();

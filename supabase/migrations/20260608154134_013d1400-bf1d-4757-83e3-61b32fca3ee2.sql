CREATE TABLE IF NOT EXISTS public.fan_zone_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fz_friend_no_self CHECK (requester_id <> addressee_id),
  CONSTRAINT fz_friend_unique_pair UNIQUE (requester_id, addressee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fan_zone_friendships TO authenticated;
GRANT ALL ON public.fan_zone_friendships TO service_role;

ALTER TABLE public.fan_zone_friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fz_friend_select_own"
  ON public.fan_zone_friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "fz_friend_insert_self_requester"
  ON public.fan_zone_friendships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "fz_friend_update_addressee_accept"
  ON public.fan_zone_friendships FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id);

CREATE POLICY "fz_friend_delete_either"
  ON public.fan_zone_friendships FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_fan_zone_friendships_updated_at ON public.fan_zone_friendships;
CREATE TRIGGER update_fan_zone_friendships_updated_at
  BEFORE UPDATE ON public.fan_zone_friendships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_fz_friend_requester ON public.fan_zone_friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_fz_friend_addressee ON public.fan_zone_friendships(addressee_id);
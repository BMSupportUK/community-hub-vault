
CREATE TYPE public.friendship_status AS ENUM ('pending', 'accepted');

CREATE TABLE public.friendships (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status public.friendship_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT friendships_no_self CHECK (requester_id <> addressee_id)
);

-- Unique unordered pair
CREATE UNIQUE INDEX friendships_pair_uniq
  ON public.friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE INDEX friendships_requester_idx ON public.friendships (requester_id);
CREATE INDEX friendships_addressee_idx ON public.friendships (addressee_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "friendships read own"
ON public.friendships FOR SELECT TO authenticated
USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE POLICY "friendships insert self"
ON public.friendships FOR INSERT TO authenticated
WITH CHECK (
  requester_id = auth.uid()
  AND NOT public.has_role(auth.uid(), 'pending'::app_role)
  AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  AND status = 'pending'
);

CREATE POLICY "friendships accept addressee"
ON public.friendships FOR UPDATE TO authenticated
USING (addressee_id = auth.uid())
WITH CHECK (addressee_id = auth.uid() AND status = 'accepted');

CREATE POLICY "friendships delete either"
ON public.friendships FOR DELETE TO authenticated
USING (requester_id = auth.uid() OR addressee_id = auth.uid());

CREATE TRIGGER friendships_updated_at
BEFORE UPDATE ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
ALTER TABLE public.friendships REPLICA IDENTITY FULL;

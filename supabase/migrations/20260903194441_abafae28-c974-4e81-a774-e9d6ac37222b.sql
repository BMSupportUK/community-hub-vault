DROP INDEX IF EXISTS public.friendships_pair_uniq;

CREATE UNIQUE INDEX friendships_direction_uniq
  ON public.friendships (requester_id, addressee_id);

DROP POLICY IF EXISTS "profiles read" ON public.profiles;
CREATE POLICY "profiles read" ON public.profiles
FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR coalesce(is_private, false) = false
  OR public.has_any_role(auth.uid(), ARRAY['admin','management']::public.app_role[])
  OR EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE f.status = 'accepted'
      AND f.requester_id = auth.uid()
      AND f.addressee_id = profiles.id
  )
);
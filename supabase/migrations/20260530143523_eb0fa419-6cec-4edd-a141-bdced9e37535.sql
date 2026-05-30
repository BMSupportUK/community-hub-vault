
-- 1) page_permissions: restrict SELECT to authenticated users (drop anon read)
DROP POLICY IF EXISTS "page_perms read" ON public.page_permissions;
CREATE POLICY "page_perms read"
  ON public.page_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- 2) signup_info: remove from realtime publication (sensitive PII)
ALTER PUBLICATION supabase_realtime DROP TABLE public.signup_info;

-- 3) user_roles: scope "roles read approved" to own user only.
--    Cross-user role lookups go via SECURITY DEFINER helpers (has_role / has_any_role).
DROP POLICY IF EXISTS "roles read approved" ON public.user_roles;
-- "roles read self" already allows users to read their own row and admin/management to read all.

-- 4) kb-videos storage bucket: restrict uploads (and deletes) to staff roles
DROP POLICY IF EXISTS "kb-videos authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "kb-videos authenticated delete" ON storage.objects;

CREATE POLICY "kb-videos staff upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'kb-videos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','staff']::app_role[])
  );

CREATE POLICY "kb-videos staff delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'kb-videos'
    AND public.has_any_role(auth.uid(), ARRAY['admin','management','moderator','staff']::app_role[])
  );

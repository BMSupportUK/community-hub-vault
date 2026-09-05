CREATE OR REPLACE FUNCTION public.forum_reported_posts(_ids uuid[])
RETURNS TABLE (target_id uuid, report_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cr.target_id, count(*)::int
  FROM public.content_reports cr
  WHERE cr.kind = 'forum_post'
    AND cr.status = 'pending'
    AND cr.target_id = ANY(_ids)
  GROUP BY cr.target_id
$$;

REVOKE ALL ON FUNCTION public.forum_reported_posts(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.forum_reported_posts(uuid[]) TO authenticated;
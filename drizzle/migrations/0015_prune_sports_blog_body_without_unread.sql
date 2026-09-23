CREATE OR REPLACE FUNCTION public.prune_sports_blog_body(_id uuid, _body text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM set_config('sports_blogs.skip_auto', 'on', true);
  UPDATE public.sports_blogs SET body = _body WHERE id = _id;
  PERFORM set_config('sports_blogs.skip_auto', 'off', true);
END;
$$;
REVOKE ALL ON FUNCTION public.prune_sports_blog_body(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_sports_blog_body(uuid, text) TO service_role;
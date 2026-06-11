ALTER TABLE public.forum_posts DISABLE TRIGGER USER;

UPDATE public.forum_posts
SET body = regexp_replace(
  body,
  '<div\s+[^>]*class="[^"]*fb-post[^"]*"[^>]*>\s*</div>',
  '<div data-link-preview="' || COALESCE((regexp_match(body, 'data-href="([^"]+)"'))[1], '') || '"></div>',
  'gi'
)
WHERE body ~* '<div[^>]*class="[^"]*fb-post[^"]*"';

ALTER TABLE public.forum_posts ENABLE TRIGGER USER;
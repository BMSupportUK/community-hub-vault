CREATE OR REPLACE FUNCTION public.sports_blog_default_cover()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.image_url IS NULL OR btrim(NEW.image_url) = '' THEN
    SELECT image_url INTO NEW.image_url FROM (
      SELECT c.image_url, 1 AS rank, c.created_at AS at
        FROM sport_cover_cache c
       WHERE c.category_id = NEW.category_id AND c.subcategory = coalesce(NEW.subcategory, '')
      UNION ALL
      SELECT b.image_url, 2, coalesce(b.updated_at, b.created_at)
        FROM sports_blogs b
       WHERE b.category_id = NEW.category_id
         AND coalesce(b.subcategory, '') = coalesce(NEW.subcategory, '')
         AND b.image_url IS NOT NULL AND btrim(b.image_url) <> ''
      UNION ALL
      SELECT b.image_url, 3, coalesce(b.updated_at, b.created_at)
        FROM sports_blogs b
       WHERE b.category_id = NEW.category_id
         AND b.image_url IS NOT NULL AND btrim(b.image_url) <> ''
    ) s
    ORDER BY rank, at DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sports_blog_default_cover() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sports_blogs_default_cover ON public.sports_blogs;
CREATE TRIGGER sports_blogs_default_cover
BEFORE INSERT OR UPDATE OF image_url ON public.sports_blogs
FOR EACH ROW EXECUTE FUNCTION public.sports_blog_default_cover();

-- Backfill guides already saved without a banner picture.
UPDATE public.sports_blogs SET image_url = NULL
 WHERE image_url IS NULL OR btrim(image_url) = '';
ALTER TABLE public.sports_blogs ADD COLUMN subcategory text;
CREATE INDEX sports_blogs_category_subcategory_idx ON public.sports_blogs (category_id, subcategory);
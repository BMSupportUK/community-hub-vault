
INSERT INTO public.sports_categories (name, slug, sort_order)
SELECT 'Cycling', 'cycling', 145
WHERE NOT EXISTS (SELECT 1 FROM public.sports_categories WHERE name = 'Cycling');

INSERT INTO public.sports_subcategories (category_id, name, sort_order, is_default)
SELECT c.id, v.name, v.sort_order, v.is_default
FROM public.sports_categories c
CROSS JOIN (VALUES
   ('Grand Tours', 10, true),
   ('Classics & One-Day', 20, false),
   ('Stage Races', 30, false),
   ('Womens', 40, false),
   ('Track & Other', 50, false)
 ) AS v(name, sort_order, is_default)
WHERE c.name = 'Cycling'
  AND NOT EXISTS (
    SELECT 1 FROM public.sports_subcategories s
    WHERE s.category_id = c.id AND s.name = v.name
  );

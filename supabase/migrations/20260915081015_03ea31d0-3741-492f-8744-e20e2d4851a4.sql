ALTER TABLE public.sports_categories
  ADD COLUMN parent_id uuid REFERENCES public.sports_categories(id) ON DELETE SET NULL;

CREATE INDEX sports_categories_parent_id_idx
  ON public.sports_categories (parent_id, sort_order);

CREATE OR REPLACE FUNCTION public.sports_categories_check_nesting()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A category cannot be its own group';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sports_categories p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Categories can only be grouped one level deep';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sports_categories c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'A category that already holds others cannot be grouped';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sports_categories_check_nesting
BEFORE INSERT OR UPDATE OF parent_id ON public.sports_categories
FOR EACH ROW EXECUTE FUNCTION public.sports_categories_check_nesting();
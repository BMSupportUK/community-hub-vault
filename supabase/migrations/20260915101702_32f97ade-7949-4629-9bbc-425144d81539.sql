CREATE OR REPLACE FUNCTION public.sports_categories_check_nesting()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  gp uuid;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A category cannot be its own group';
    END IF;
    -- Allow up to three levels: NEW -> parent -> grandparent. Block a fourth.
    SELECT p.parent_id INTO gp FROM public.sports_categories p WHERE p.id = NEW.parent_id;
    IF gp IS NOT NULL AND EXISTS (SELECT 1 FROM public.sports_categories g WHERE g.id = gp AND g.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Categories can only be grouped three levels deep';
    END IF;
    -- A category that already has children two levels below cannot itself be grouped deeper.
    IF EXISTS (
      SELECT 1 FROM public.sports_categories c
      JOIN public.sports_categories gc ON gc.parent_id = c.id
      WHERE c.parent_id = NEW.id
    ) AND NEW.parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'A category that already holds a sub-group cannot be grouped deeper';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
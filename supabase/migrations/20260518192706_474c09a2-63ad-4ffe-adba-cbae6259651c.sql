
CREATE OR REPLACE FUNCTION public.validate_equipped_nameplate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.equipped_nameplate_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.nameplates
    WHERE id = NEW.equipped_nameplate_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Nameplate is not available';
  END IF;
  RETURN NEW;
END;
$$;

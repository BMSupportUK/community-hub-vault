CREATE OR REPLACE FUNCTION public.retire_completed_direct_install_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL THEN
    NEW.code_hash := 'completed:' || NEW.id::text;
    NEW.expires_at := LEAST(NEW.expires_at, NEW.completed_at);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.retire_completed_direct_install_link() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER retire_completed_direct_install_link
BEFORE INSERT OR UPDATE ON public.direct_install_links
FOR EACH ROW EXECUTE FUNCTION public.retire_completed_direct_install_link();
COMMENT ON FUNCTION public.retire_completed_direct_install_link() IS 'Erases the original download-code hash on completion while preserving progress and download history.';
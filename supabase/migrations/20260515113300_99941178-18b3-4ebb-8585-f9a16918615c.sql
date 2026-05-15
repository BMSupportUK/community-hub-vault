DROP TRIGGER IF EXISTS prevent_ignore_staff_trigger ON public.user_ignores;
CREATE TRIGGER prevent_ignore_staff_trigger
BEFORE INSERT ON public.user_ignores
FOR EACH ROW EXECUTE FUNCTION public.prevent_ignore_staff();
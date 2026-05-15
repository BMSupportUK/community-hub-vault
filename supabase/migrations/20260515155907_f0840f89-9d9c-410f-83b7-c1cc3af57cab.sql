
CREATE TRIGGER sports_blogs_set_updated_at
BEFORE UPDATE ON public.sports_blogs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

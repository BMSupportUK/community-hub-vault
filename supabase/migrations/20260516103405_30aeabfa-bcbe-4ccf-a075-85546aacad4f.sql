
-- Star ratings (1-5) for knowledge base articles. No comments.
CREATE TABLE IF NOT EXISTS public.kb_article_ratings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID NOT NULL REFERENCES public.kb_articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (article_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_kb_article_ratings_article ON public.kb_article_ratings(article_id);

ALTER TABLE public.kb_article_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone approved can view article ratings"
  ON public.kb_article_ratings FOR SELECT
  TO authenticated
  USING (
    NOT public.has_role(auth.uid(), 'pending'::app_role)
    AND NOT public.has_role(auth.uid(), 'banned'::app_role)
  );

CREATE POLICY "Users can rate articles"
  ON public.kb_article_ratings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own rating"
  ON public.kb_article_ratings FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own rating"
  ON public.kb_article_ratings FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER kb_article_ratings_set_updated_at
BEFORE UPDATE ON public.kb_article_ratings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

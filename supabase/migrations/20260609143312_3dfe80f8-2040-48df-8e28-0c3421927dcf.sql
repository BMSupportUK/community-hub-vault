
ALTER VIEW public.wc_leaderboard SET (security_invoker = true);

CREATE OR REPLACE FUNCTION public.wc_calc_points(
  hp int, ap int, hs int, as_ int
) RETURNS int
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN hp IS NULL OR ap IS NULL OR hs IS NULL OR as_ IS NULL THEN NULL
    WHEN hp = hs AND ap = as_ THEN 5
    WHEN sign(hp - ap) = sign(hs - as_) AND (hp - ap) = (hs - as_) THEN 3
    WHEN sign(hp - ap) = sign(hs - as_) THEN 1
    ELSE 0
  END;
$$;

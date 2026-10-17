DO $migration$
DECLARE
  fn regprocedure;
  definition text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.notify_new_order()'::regprocedure, 'public.notify_staff_order_paid()'::regprocedure]
  LOOP
    definition := pg_get_functiondef(fn);
    IF position('/shop?view=orders&id=' in definition) = 0 THEN
      RAISE EXCEPTION 'Expected legacy order notification destination in %', fn;
    END IF;
    EXECUTE replace(definition, '/shop?view=orders&id=', '/admin-secure-page?order=');
  END LOOP;
END;
$migration$;
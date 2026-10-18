DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.tg_orders_iud'::regproc);
  IF position('manual_pay_method = NEW.manual_pay_method' in d) = 0 THEN
    d := replace(d, 'wants_adult_content = NEW.wants_adult_content,',
      'wants_adult_content = NEW.wants_adult_content,
      manual_pay_method = NEW.manual_pay_method,');
    EXECUTE d;
  END IF;
END $$;
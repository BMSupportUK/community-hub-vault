CREATE TABLE public.pay_by_bank_banks (
  name text PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pay_by_bank_banks TO anon, authenticated;
GRANT ALL ON public.pay_by_bank_banks TO service_role;
ALTER TABLE public.pay_by_bank_banks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pay by bank list public read" ON public.pay_by_bank_banks FOR SELECT TO anon, authenticated USING (true);
INSERT INTO public.pay_by_bank_banks (name) VALUES
('Barclays'),('Bank of Scotland'),('Danske Bank'),('First Direct'),('Halifax'),('HSBC'),('Lloyds Bank'),('Monzo'),('Nationwide'),('NatWest'),('Revolut'),('Royal Bank of Scotland'),('Santander'),('TSB'),('Ulster Bank');
ALTER PUBLICATION supabase_realtime ADD TABLE public.pay_by_bank_banks;
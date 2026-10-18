import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { isOpenBankingSession } from './profit-payment-groups';

export const getProfitOpenBankingOrders = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderIds: z.array(z.string().uuid()).max(200) }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: allowed, error: roleError } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['admin', 'management'] });
    if (roleError || !allowed) throw new Error('Not authorised');
    if (!data.orderIds.length) return { verified: [] as { orderId: string; paymentId: string; openBanking: boolean }[], unavailable: 0 };
    const { data: rows, error } = await context.supabase.from('order_payments').select('order_id,provider_payment_id').eq('provider', 'stripe').in('order_id', data.orderIds).like('provider_payment_id', 'cs_%');
    if (error) throw new Error(error.message);
    const { createStripeClient } = await import('./stripe.server');
    const primary = process.env.STRIPE_ENVIRONMENT === 'live' ? 'live' : 'sandbox';
    const verified: { orderId: string; paymentId: string; openBanking: boolean }[] = [];
    let unavailable = 0;
    for (const row of rows ?? []) {
      if (!row.order_id || !row.provider_payment_id) continue;
      let found = false;
      for (const environment of primary === 'live' ? ['live', 'sandbox'] as const : ['sandbox', 'live'] as const) {
        try {
          const session = await createStripeClient(environment).checkout.sessions.retrieve(row.provider_payment_id, { expand: ['payment_intent.latest_charge'] });
          if (session.metadata?.order_id !== row.order_id) continue;
          verified.push({ orderId: row.order_id, paymentId: row.provider_payment_id, openBanking: Boolean(isOpenBankingSession(session)) });
          found = true;
          break;
        } catch { /* Historical records can belong to the other environment. */ }
      }
      if (!found) unavailable++;
    }
    return { verified, unavailable };
  });
import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const refreshProviderFees = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { data: allowed, error: roleError } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['admin', 'management'] });
      if (roleError || !allowed) return { error: 'Not authorised' };
      const { data: rows, error } = await context.supabase.from('order_payments').select('id,provider,provider_payment_id,square_payment_id,status,currency,amount_cents').is('provider_fee_cents', null).in('provider', ['square', 'stripe']).in('status', ['COMPLETED', 'completed', 'paid', 'PAID', 'approved', 'APPROVED', 'captured', 'CAPTURED', 'finished', 'FINISHED']).order('created_at', { ascending: false }).limit(25);
      if (error) return { error: error.message };
      const { fetchProviderFee } = await import('./provider-fees.server');
      let updated = 0;
      let unavailable = 0;
      for (const row of rows ?? []) {
        const reference = row.provider_payment_id || row.square_payment_id;
        if (!reference || row.currency?.toUpperCase() !== 'GBP' || !row.provider) { unavailable++; continue; }
        try {
          if (row.amount_cents == null) { unavailable++; continue; }
          const fee = await fetchProviderFee(row.provider, reference, process.env.STRIPE_ENVIRONMENT === 'live' ? 'live' : 'sandbox', row.amount_cents);
          if (fee == null) { unavailable++; continue; }
          const { error: saveError } = await context.supabase.from('order_payments').update({ provider_fee_cents: fee }).eq('id', row.id).is('provider_fee_cents', null);
          if (saveError) throw new Error(saveError.message);
          updated++;
        } catch { unavailable++; }
      }
      return { updated, unavailable };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not refresh provider fees' };
    }
  });
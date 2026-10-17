import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { changedProviderFee, nextFeeOffset } from './provider-fee-refresh';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const refreshProviderFees = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ offset: z.number().int().min(0).max(1_000_000).default(0) }).parse(input ?? {}))
  .handler(async ({ context, data }) => {
    try {
      const { data: allowed, error: roleError } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['admin', 'management'] });
      if (roleError || !allowed) return { error: 'Not authorised' };
      const { data: rows, error } = await context.supabase.from('order_payments').select('id,provider,provider_payment_id,square_payment_id,status,currency,amount_cents,provider_fee_cents').in('provider', ['square', 'stripe']).in('status', ['COMPLETED', 'completed', 'paid', 'PAID', 'approved', 'APPROVED', 'captured', 'CAPTURED', 'finished', 'FINISHED']).order('created_at', { ascending: false }).order('id').range(data.offset, data.offset + 24);
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
          const changed = changedProviderFee(row.provider_fee_cents, fee);
          if (changed === null) continue;
          let save = context.supabase.from('order_payments').update({ provider_fee_cents: changed }).eq('id', row.id);
          save = row.provider_fee_cents === null ? save.is('provider_fee_cents', null) : save.eq('provider_fee_cents', row.provider_fee_cents);
          const { data: saved, error: saveError } = await save.select('id');
          if (saveError) throw new Error(saveError.message);
          updated += saved?.length ?? 0;
        } catch { unavailable++; }
      }
      return { updated, unavailable, nextOffset: nextFeeOffset(data.offset, rows?.length ?? 0) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Could not refresh provider fees' };
    }
  });
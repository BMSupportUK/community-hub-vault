import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
const options = z.object({ method: z.enum(['square','stripe']), environment: z.enum(['sandbox','live']) });
export const checkoutProviderInvoice = createServerFn({ method: 'POST' })
 .inputValidator(d => options.extend({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().max(64).default('') }).parse(d))
 .handler(async ({ data }) => {
  try {
   const { unlock } = await import('@/lib/checkout.server');
   const unlocked = await unlock(data.token, data.password);
   if (!unlocked) throw new Error('Not authorized');
   const { createProviderInvoice } = await import('@/lib/provider-invoices.server');
   return await createProviderInvoice(unlocked.supabaseAdmin, unlocked.link.order_id, data.method, data.environment, null);
  } catch (error) { const { getStripeErrorMessage } = await import('@/lib/stripe.server'); return { error: getStripeErrorMessage(error) }; }
 });
export const orderProviderInvoice = createServerFn({ method: 'POST' })
 .middleware([requireSupabaseAuth])
 .inputValidator(d => options.extend({ orderId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  try {
   const { data: order } = await context.supabase.from('orders').select('user_id').eq('id', data.orderId).maybeSingle();
   const { data: allowed } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['admin','management'] });
   if (order?.user_id !== context.userId && !allowed) throw new Error('Not authorized');
   const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
   const { createProviderInvoice } = await import('@/lib/provider-invoices.server');
   return await createProviderInvoice(supabaseAdmin, data.orderId, data.method, data.environment, context.userId);
  } catch (error) { const { getStripeErrorMessage } = await import('@/lib/stripe.server'); return { error: getStripeErrorMessage(error) }; }
 });
export const refreshOrderProviderInvoice = createServerFn({ method: 'POST' })
 .middleware([requireSupabaseAuth])
 .inputValidator(d => z.object({ orderId: z.string().uuid() }).parse(d))
 .handler(async ({ data, context }) => {
  try {
   const { data: order } = await context.supabase.from('orders').select('user_id').eq('id', data.orderId).maybeSingle();
   const { data: allowed } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['admin','management'] });
   if (order?.user_id !== context.userId && !allowed) throw new Error('Not authorized');
   const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
   const { syncProviderInvoice } = await import('@/lib/provider-invoices.server');
   const row = await syncProviderInvoice(supabaseAdmin, data.orderId);
   return { paid: row?.paid ?? false, status: row?.status ?? '', public_url: row?.public_url ?? null, provider: row?.provider ?? null };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Could not check invoice' }; }
 });
export const refreshCheckoutProviderInvoice = createServerFn({ method: 'POST' })
 .inputValidator(d => z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().max(64).default('') }).parse(d))
 .handler(async ({ data }) => {
  try {
   const { unlock } = await import('@/lib/checkout.server');
   const unlocked = await unlock(data.token, data.password);
   if (!unlocked) throw new Error('Not authorized');
   const { syncProviderInvoice } = await import('@/lib/provider-invoices.server');
   const row = await syncProviderInvoice(unlocked.supabaseAdmin, unlocked.link.order_id);
   return { paid: row?.paid ?? false, status: row?.status ?? '', public_url: row?.public_url ?? null, provider: row?.provider ?? null };
  } catch (error) { return { error: error instanceof Error ? error.message : 'Could not check invoice' }; }
 });

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const getSquareCheckoutLink = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(d => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase.from('orders').select('user_id').eq('id', data.orderId).maybeSingle();
    const { data: allowed } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['admin', 'management'] });
    if (order?.user_id !== context.userId && !allowed) throw new Error('Not authorized');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: link, error } = await supabaseAdmin.from('order_checkout_links').select('token').eq('order_id', data.orderId).maybeSingle();
    if (error || !link?.token) throw new Error('This order has no secure checkout link. Please contact BM Support.');
    return { token: link.token };
  });
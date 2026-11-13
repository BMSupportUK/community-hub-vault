import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const sendManualCheckoutEmail = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(input => z.object({ customerId: z.string().uuid(), orderId: z.string().uuid(), requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // The authenticated RPC validates customer ownership, order status and role,
    // then atomically binds the order and resolves the saved contact email.
    const { data: details, error } = await context.supabase.rpc('admin_manual_customer_checkout_email', { p_customer_id: data.customerId, p_order_id: data.orderId });
    if (error) throw new Error(error.message);
    const parsed = z.object({ email: z.string().email(), name: z.string().nullable(), ref: z.string().nullable(), token: z.string().min(1), password: z.string().min(1) }).parse(details);
    const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
    return sendTemplateEmail('manual-checkout', parsed.email, {
      templateData: { name: parsed.name, orderRef: parsed.ref, checkoutUrl: `https://bmsupport.uk/pay/${encodeURIComponent(parsed.token)}`, password: parsed.password },
      idempotencyKey: `manual-checkout-${data.orderId}-${data.requestId}`,
    });
  });
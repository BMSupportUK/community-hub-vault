import { z } from 'zod';
export const manualRegistrationSchema = z.object({ orderId: z.string().uuid(), skip: z.boolean() }).strict();
export function requiresManualRegistration(order: { manual?: boolean; skipRegistration?: boolean }) {
  return order.manual === true && order.skipRegistration !== true;
}

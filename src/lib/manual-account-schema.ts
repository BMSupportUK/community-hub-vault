import { z } from 'zod';
import { manualCheckoutAccessSchema, manualAccessPinSchema } from './manual-credentials-schema';

export const manualAccountFieldsSchema = z.object({
  username: z.string().trim().min(3, 'Enter at least 3 characters for your username.').max(32).regex(/^[a-zA-Z0-9_]+$/, 'Use letters, numbers and underscores only.'),
  displayName: z.string().trim().min(1, 'Enter your display name.').max(80),
  gender: z.enum(['male', 'female'], { message: 'Select Male or Female.' }),
  pin: manualAccessPinSchema,
});
export const manualAccountSignupSchema = manualCheckoutAccessSchema.extend({
  ...manualAccountFieldsSchema.shape,
  sitePassword: z.string().min(10, 'Choose a site password with at least 10 characters.').max(128),
}).strict();
export type ManualAccountFields = z.infer<typeof manualAccountFieldsSchema>;
export function canCreateManualAccount(order: { manual?: boolean; skipRegistration?: boolean; paidAt?: string | null; completedAt?: string | null; cancelled?: boolean }) {
  return order.manual === true && order.skipRegistration !== true && !!order.paidAt && !!order.completedAt && !order.cancelled;
}
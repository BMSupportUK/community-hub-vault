import { z } from 'zod';
export const manualAccessRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const manualAccessPinSchema = z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN.');
export const manualAccessLoginSchema = manualAccessRequestSchema.extend({ password: z.string().trim().min(16).max(128), pin: manualAccessPinSchema });
export const manualAccessPinSetupSchema = manualAccessLoginSchema.extend({ confirmPin: manualAccessPinSchema, appLogin: z.string().trim().min(1).max(128), appPassword: z.string().min(1).max(256) }).refine(data => data.pin === data.confirmPin, { message: 'The PINs must match.', path: ['confirmPin'] });
export const manualAccessSubmitSchema = z.union([manualAccessPinSetupSchema, manualAccessLoginSchema]).superRefine((data, ctx) => {
  if ('appLogin' in data && data.pin !== data.confirmPin) ctx.addIssue({ code: 'custom', message: 'The PINs must match.' });
});
export interface ManualCredential { id: string; name?: string; login: string | null; password: string | null; expiresAt: string | null; accountType?: string; package?: string | null }
export interface ManualCredentialCustomer { userId: string; displayName?: string; username?: string; accounts: ManualCredential[] }
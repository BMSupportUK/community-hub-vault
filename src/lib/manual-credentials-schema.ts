import { z } from 'zod';
export const manualAccessRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const manualAccessPinSchema = z.string().regex(/^\d{6}$/, 'Enter a 6-digit PIN.');
export const manualAccessLoginSchema = manualAccessRequestSchema.extend({ password: z.string().trim().min(16).max(128), pin: manualAccessPinSchema });
export const manualCheckoutAccessSchema = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(1).max(64) });
export const manualAccessPinSetupSchema = manualCheckoutAccessSchema.extend({ pin: manualAccessPinSchema, confirmPin: manualAccessPinSchema }).refine(data => data.pin === data.confirmPin, { message: 'The PINs must match.', path: ['confirmPin'] });
export interface ManualCredential { id: string; name?: string; login: string | null; password: string | null; expiresAt: string | null; accountType?: string; package?: string | null }
export interface ManualCredentialCustomer { userId: string; displayName?: string; username?: string; accounts: ManualCredential[] }
import { z } from 'zod';
export const manualAccessRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const manualAccessLoginSchema = manualAccessRequestSchema.extend({ password: z.string().trim().min(16).max(128) });
export interface ManualCredential { id: string; name?: string; login: string | null; password: string | null; expiresAt: string | null; accountType?: string; package?: string | null }
export interface ManualCredentialCustomer { userId: string; displayName?: string; username?: string; accounts: ManualCredential[] }
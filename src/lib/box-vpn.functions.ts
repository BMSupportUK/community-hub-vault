import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

async function ownBox(context: { supabase: any; userId: string }, deviceId: string) {
  const { data } = await context.supabase.from('player_devices').select('id, user_id, platform').eq('id', deviceId).maybeSingle();
  if (!data || data.user_id !== context.userId) return null;
  return data as { id: string; platform: string };
}

/** The customer's boxes with their VPN state; sign-in details are never returned. */
export const myBoxVpn = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: boxes } = await context.supabase.from('player_devices').select('id').eq('user_id', context.userId);
  const ids = (boxes ?? []).map((b) => b.id);
  if (!ids.length) return [];
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin.from('player_vpn_configs').select('device_id, provider_id, enabled, server, status, status_detail, updated_at').in('device_id', ids).eq('user_id', context.userId);
  return data ?? [];
});

export const sendVpnToBox = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ deviceId: z.string().uuid(), providerId: z.string().min(1).max(40), secret: z.string().trim().min(20).max(8000) }))
  .handler(async ({ data, context }) => {
    const box = await ownBox(context, data.deviceId);
    if (!box) return { ok: false, error: 'That box is not on your account.' };
    if (!['android', 'firetv', 'phone'].includes(box.platform)) return { ok: false, error: 'VPN on your box works on Android boxes, Fire TV and phones only.' };
    const { data: prov } = await context.supabase.from('vpn_providers').select('id, enabled, auth_kind').eq('id', data.providerId).maybeSingle();
    if (!prov?.enabled) return { ok: false, error: 'Pick a VPN provider from the list.' };
    if (prov.auth_kind === 'wg_config') { const { checkWgFile } = await import('./vpn-picker'); const f = checkWgFile(data.secret); if (!f.ok) return { ok: false, error: f.error }; }
    const { lockVpnCreds } = await import('./box-vpn.server');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('player_vpn_configs').upsert({
      device_id: box.id, user_id: context.userId, provider_id: prov.id, cred_cipher: await lockVpnCreds(data.secret, ''),
      enabled: true, server: null, status: 'sent', status_detail: null, reselect_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false, error: 'Could not send to your box. Please try again.' };
    return { ok: true, error: null as string | null };
  });

export const setBoxVpn = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ deviceId: z.string().uuid(), action: z.enum(['off', 'on', 'change']) }))
  .handler(async ({ data, context }) => {
    const box = await ownBox(context, data.deviceId);
    if (!box) return { ok: false, error: 'That box is not on your account.' };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const now = new Date().toISOString();
    const patch = data.action === 'off' ? { enabled: false, updated_at: now } : data.action === 'on' ? { enabled: true, reselect_at: now, updated_at: now } : { enabled: true, reselect_at: now, status: 'connecting', updated_at: now };
    const { error } = await supabaseAdmin.from('player_vpn_configs').update(patch).eq('device_id', box.id).eq('user_id', context.userId);
    if (error) return { ok: false, error: 'Please try again.' };
    return { ok: true, error: null as string | null };
  });

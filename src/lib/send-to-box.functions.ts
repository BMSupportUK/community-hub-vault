import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { SENDABLE_PLATFORMS, boxIsOn } from './send-to-box';

const PLATFORM_LABEL: Record<string, string> = { android: 'Android box', firetv: 'Fire TV', phone: 'Phone', windows: 'Windows PC', mac: 'Mac' };

/** The signed-in customer's own BM Player boxes, with whether each is on right now. */
export const listMyBoxes = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data } = await context.supabase.from('player_devices').select('id, name, platform, last_seen_at')
    .eq('user_id', context.userId).in('platform', [...SENDABLE_PLATFORMS]).order('last_seen_at', { ascending: false, nullsFirst: false });
  const now = Date.now();
  // Reinstalls leave a dead row per platform; only the newest of each platform can be the open app.
  const seen = new Set<string>();
  return (data ?? []).filter(d => { if (seen.has(d.platform)) return false; seen.add(d.platform); return true; })
    .map(d => ({ id: d.id, name: d.name || 'BM Player', type: PLATFORM_LABEL[d.platform] ?? 'Box', on: boxIsOn(d.last_seen_at, now) }));
});

export const sendToBox = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    deviceId: z.string().uuid(), kind: z.enum(['movie', 'series']),
    itemId: z.string().regex(/^\d{1,15}$/).nullable(), title: z.string().trim().min(1).max(200),
  }))
  .handler(async ({ data, context }) => {
    const { data: own } = await context.supabase.from('player_devices').select('id, user_id, platform, last_seen_at').eq('id', data.deviceId).maybeSingle();
    if (!own || own.user_id !== context.userId || !(SENDABLE_PLATFORMS as readonly string[]).includes(own.platform)) return { ok: false, error: 'That box is not on your account.' };
    if (!boxIsOn(own.last_seen_at, Date.now())) return { ok: false, error: 'Your box is not on. Turn it on and open BM Player, then try again.' };
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('player_watch_requests').insert({
      device_id: own.id, user_id: context.userId, kind: data.kind === 'movie' ? 'film' : 'series', item_id: data.itemId, title: data.title,
    });
    if (error) return { ok: false, error: 'Could not send to your box. Please try again.' };
    return { ok: true, error: null as string | null };
  });

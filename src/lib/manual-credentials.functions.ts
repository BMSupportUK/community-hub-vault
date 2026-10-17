import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie, deleteCookie, getRequestHeader, setResponseHeader } from '@tanstack/react-start/server';
import { manualAccessRequestSchema, manualAccessLoginSchema, type ManualCredential } from './manual-credentials-schema';

const cookieName = 'bm-manual-credentials';
async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function randomPassword() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); }
function noStore() { setResponseHeader('Cache-Control', 'no-store'); }

export const requestManualCredentialsAccess = createServerFn({ method: 'POST' })
  .inputValidator(input => manualAccessRequestSchema.parse(input))
  .handler(async ({ data }) => {
    noStore();
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const key = await hash(data.email);
    const ip = getRequestHeader('cf-connecting-ip') || 'shared-preview';
    const { data: ipAllowed, error: ipError } = await supabaseAdmin.rpc('manual_credentials_throttle', { p_key: `ip:${await hash(ip)}`, p_limit: 20 });
    const { data: allowed, error: limitError } = await supabaseAdmin.rpc('manual_credentials_throttle', { p_key: `email:${key}`, p_limit: 3 });
    if (ipError || limitError) throw new Error('Secure access is temporarily unavailable. Please try again.');
    if (!ipAllowed || !allowed) return { requested: true };
    const { data: rows, error } = await supabaseAdmin.rpc('manual_credentials_for_email', { p_email: data.email });
    if (error) throw new Error('Secure access is temporarily unavailable. Please try again.');
    if (!Array.isArray(rows) || rows.length === 0) return { requested: true };
    const password = randomPassword();
    const { error: saveError } = await supabaseAdmin.from('manual_credential_access').upsert({ email_key: key, code_hash: await hash(`${key}:${password}`), code_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(), attempts: 0, session_hash: null, session_expires_at: null });
    if (saveError) throw new Error('Secure access is temporarily unavailable. Please try again.');
    const { sendTemplateEmail } = await import('@/lib/email-templates/send-email');
    try {
      await sendTemplateEmail('manual-credentials-access', data.email, { templateData: { password, loginUrl: 'https://bmsupport.uk/manual-credentials' }, idempotencyKey: crypto.randomUUID() });
    } catch { throw new Error('We could not send the access email. Please try again later.'); }
    return { requested: true };
  });

export const loginManualCredentials = createServerFn({ method: 'POST' })
  .inputValidator(input => manualAccessLoginSchema.parse(input))
  .handler(async ({ data }) => {
    noStore();
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const key = await hash(data.email);
    const session = randomPassword();
    const { data: valid, error } = await supabaseAdmin.rpc('manual_credentials_verify', { p_email_key: key, p_code_hash: await hash(`${key}:${data.password}`), p_session_hash: await hash(session) });
    if (error || !valid) throw new Error('Invalid or expired secure password. Request a new one.');
    // Viewing window is strictly 10 minutes; the customer must request new access afterwards.
    await supabaseAdmin.from('manual_credential_access').update({ session_expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }).eq('email_key', key);
    setCookie(cookieName, JSON.stringify({ email: data.email, session }), { httpOnly: true, secure: !getRequestHeader('host')?.startsWith('localhost'), sameSite: 'strict', path: '/', maxAge: 600 });
    return { loggedIn: true };
  });

export const readManualCredentials = createServerFn({ method: 'POST' }).handler(async () => {
  noStore();
  const raw = getCookie(cookieName);
  if (!raw) return null;
  let saved: { email: string; session: string };
  try { saved = JSON.parse(raw); if (!manualAccessRequestSchema.safeParse(saved).success || typeof saved.session !== 'string' || saved.session.length > 128) return null; } catch { return null; }
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: access, error } = await supabaseAdmin.from('manual_credential_access').select('session_hash,session_expires_at').eq('email_key', await hash(saved.email)).maybeSingle();
  if (error || !access?.session_expires_at || new Date(access.session_expires_at).getTime() <= Date.now() || access.session_hash !== await hash(saved.session)) return null;
  const { data, error: readError } = await supabaseAdmin.rpc('manual_credentials_for_email', { p_email: saved.email });
  if (readError) throw new Error('Your details could not be loaded. Please try again.');
  return { accounts: data as unknown as ManualCredential[], expiresAt: access.session_expires_at as string };
});

export const logoutManualCredentials = createServerFn({ method: 'POST' }).handler(async () => {
  noStore();
  const raw = getCookie(cookieName);
  deleteCookie(cookieName, { path: '/' });
  if (raw) {
    try {
      const saved = JSON.parse(raw);
      if (typeof saved.email === 'string' && typeof saved.session === 'string') {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        await supabaseAdmin.from('manual_credential_access').update({ session_hash: null, session_expires_at: null }).eq('email_key', await hash(saved.email)).eq('session_hash', await hash(saved.session));
      }
    } catch { /* cookie is already removed */ }
  }
  return { loggedOut: true };
});
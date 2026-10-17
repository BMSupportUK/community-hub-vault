import { createServerFn } from '@tanstack/react-start';
import { getCookie, setCookie, deleteCookie, getRequestHeader, setResponseHeader } from '@tanstack/react-start/server';
import { manualAccessRequestSchema, manualAccessSubmitSchema, type ManualCredential } from './manual-credentials-schema';

const cookieName = 'bm-manual-credentials';
async function hash(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}
function randomPassword() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join(''); }
async function hashPin(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
}
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
  .inputValidator(input => manualAccessSubmitSchema.parse(input))
  .handler(async ({ data }) => {
    noStore();
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const key = await hash(data.email);
    const session = randomPassword();
    const ip = getRequestHeader('cf-connecting-ip') || 'shared-preview';
    const { data: allowed, error: throttleError } = await supabaseAdmin.rpc('manual_credentials_throttle', { p_key: `login-ip:${await hash(ip)}`, p_limit: 30 });
    if (throttleError || !allowed) throw new Error('Too many access attempts. Please try again later.');
    const { data: access, error: accessError } = await supabaseAdmin.from('manual_credential_access').select('pin_salt').eq('email_key', key).maybeSingle();
    if (accessError) throw new Error('Secure access is temporarily unavailable.');
    const salt = access?.pin_salt || randomPassword();
    const { data: valid, error } = await supabaseAdmin.rpc('manual_credentials_verify_pin', {
      p_email_key: key, p_email: data.email, p_code_hash: await hash(`${key}:${data.password}`),
      p_pin_hash: await hashPin(data.pin, salt), p_pin_salt: salt, p_session_hash: await hash(session),
      p_app_login: 'appLogin' in data ? data.appLogin : undefined, p_app_password: 'appPassword' in data ? data.appPassword : undefined,
    });
    if (!error && valid === 'setup_required') return { loggedIn: false, setupRequired: true };
    if (error || valid !== 'verified') throw new Error('Access denied. Check your secure password, PIN and login details. After five failed attempts, access is locked for one hour.');
    setCookie(cookieName, JSON.stringify({ email: data.email, session }), { httpOnly: true, secure: !getRequestHeader('host')?.startsWith('localhost'), sameSite: 'strict', path: '/', maxAge: 600 });
    return { loggedIn: true, setupRequired: false };
  });

export const readManualCredentials = createServerFn({ method: 'POST' }).handler(async () => {
  noStore();
  const raw = getCookie(cookieName);
  if (!raw) return null;
  let saved: { email: string; session: string };
  try { saved = JSON.parse(raw); if (!manualAccessRequestSchema.safeParse(saved).success || typeof saved.session !== 'string' || saved.session.length > 128) return null; } catch { return null; }
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: access, error } = await supabaseAdmin.from('manual_credential_access').select('session_hash,session_expires_at,pin_hash').eq('email_key', await hash(saved.email)).maybeSingle();
  if (error || !access?.pin_hash || !access.session_expires_at || new Date(access.session_expires_at).getTime() <= Date.now() || access.session_hash !== await hash(saved.session)) return null;
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
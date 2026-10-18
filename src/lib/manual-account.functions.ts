import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { createClient } from '@supabase/supabase-js';
import { canCreateManualAccount, manualAccountSignupSchema } from './manual-account-schema';

export const createManualCheckoutAccount = createServerFn({ method: 'POST' })
  .inputValidator(input => manualAccountSignupSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader('Cache-Control', 'no-store');
    const { unlock } = await import('./checkout.server');
    const unlocked = await unlock(data.token, data.password);
    if (!unlocked || unlocked.link.claimed_by) throw new Error('Open your manual order with its secure link and password.');
    const { supabaseAdmin, link } = unlocked;
    const { data: order, error } = await supabaseAdmin.from('orders').select('email,paid_at,completed_at,status').eq('id', link.order_id).maybeSingle();
    if (error || !order || !canCreateManualAccount({ manual: true, skipRegistration: link.skip_registration, paidAt: order.paid_at, completedAt: order.completed_at, cancelled: order.status === 'cancelled' })) throw new Error('Account creation is available after your manual order is completed.');
    if (!order.email) throw new Error('Ask BM Support to save your email address on this order first.');
    const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
    const email = order.email.trim().toLowerCase();
    const emailKey = await digest(email);
    const { data: allowed, error: throttleError } = await supabaseAdmin.rpc('manual_credentials_throttle', { p_key: `account:${emailKey}`, p_limit: 5 });
    if (throttleError || !allowed) throw new Error('Too many attempts. Please try again later.');
    const { data: existing, error: accountError } = await supabaseAdmin.rpc('email_is_account_holder', { _email: email });
    if (accountError) throw new Error('Account creation is temporarily unavailable.');
    if (existing) throw new Error('You already have a site account. Sign in to that account instead.');
    const { data: taken, error: nameError } = await supabaseAdmin.from('profiles').select('id').ilike('username', data.username).limit(1);
    if (nameError) throw new Error('Your username could not be checked.');
    if (taken?.length) throw new Error('That username is taken. Choose another one.');
    const { data: access, error: pinError } = await supabaseAdmin.from('manual_credential_access').select('pin_hash,pin_salt').eq('email_key', emailKey).maybeSingle();
    if (pinError) throw new Error('Your PIN could not be checked.');
    const salt = access?.pin_salt || Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(data.pin), 'PBKDF2', false, ['deriveBits']);
    const pinHash = Array.from(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 }, key, 256)), b => b.toString(16).padStart(2, '0')).join('');
    if (access?.pin_hash && access.pin_hash !== pinHash) throw new Error('Enter the credentials PIN you already set on your secure order.');
    if (!access?.pin_hash) {
      const { data: saved, error: saveError } = await supabaseAdmin.rpc('manual_credentials_set_checkout_pin', { p_token: data.token, p_password: data.password, p_email_key: emailKey, p_pin_hash: pinHash, p_pin_salt: salt });
      if (saveError || !saved) throw new Error('Your PIN could not be saved. Please try again.');
    }
    const url = process.env['SUPABASE_URL'];
    const publishable = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!url || !publishable) throw new Error('Account creation is temporarily unavailable.');
    const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (publishable.startsWith('sb_') && headers.get('Authorization') === `Bearer ${publishable}`) headers.delete('Authorization');
      headers.set('apikey', publishable);
      return fetch(input, { ...init, headers });
    } } });
    const { data: signup, error: signupError } = await client.auth.signUp({ email, password: data.sitePassword, options: { emailRedirectTo: 'https://bmsupport.uk', data: { username: data.username, display_name: data.displayName, access_intent: 'bm-support' } } });
    if (signupError || !signup.user?.id || signup.user.identities?.length === 0) throw new Error('Your account could not be created. If you already registered, sign in instead.');
    const { error: profileError } = await supabaseAdmin.from('profiles').update({ staff_gender: data.gender, staff_gender_confirmed_at: new Date().toISOString() }).eq('id', signup.user.id);
    if (profileError) throw new Error('Your account was created, but your profile needs completing after you confirm your email.');
    return { created: true, confirmationRequired: !signup.session };
  });
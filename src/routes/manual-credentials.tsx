import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { KeyRound, Mail, LogOut, Loader2 } from 'lucide-react';
import tvLoginIllustration from '@/assets/tv-login-illustration.jpg';
import { Button } from '@/components/ui/button';
import { ManualCredentialCards } from '@/components/app/ManualCredentialCards';
import { requestManualCredentialsAccess, loginManualCredentials, readManualCredentials, logoutManualCredentials } from '@/lib/manual-credentials.functions';
import { manualAccessRequestSchema, manualAccessLoginSchema, type ManualCredential } from '@/lib/manual-credentials-schema';

export const Route = createFileRoute('/manual-credentials')({ component: ManualCredentialsPage, head: () => ({ meta: [
  { title: 'Private Manual Order Credentials — BM Support' }, { name: 'description', content: 'Secure access to your BM Support manual-order subscription credentials.' },
  { property: 'og:title', content: 'Private Manual Order Credentials — BM Support' }, { property: 'og:description', content: 'Secure access to your BM Support manual-order subscription credentials.' },
  { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex, nofollow' },
] }) });
function ManualCredentialsPage() {
  const requestAccess = useServerFn(requestManualCredentialsAccess), login = useServerFn(loginManualCredentials), read = useServerFn(readManualCredentials), logout = useServerFn(logoutManualCredentials);
  const [accounts, setAccountsRaw] = useState<ManualCredential[] | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null), [now, setNow] = useState(() => Date.now());
  const setAccounts = (r: { accounts: ManualCredential[]; expiresAt: string } | null) => { setAccountsRaw(r ? r.accounts : null); setExpiresAt(r ? new Date(r.expiresAt).getTime() : null); };
  useEffect(() => { if (!expiresAt) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [expiresAt]);
  const remaining = expiresAt ? Math.max(0, expiresAt - now) : 0;
  useEffect(() => { if (expiresAt && remaining === 0) { void logout().catch(() => {}); setAccounts(null); setSent(false); clearSecrets(); setError('Your 10-minute viewing time has ended. Request a new secure password to view your details again.'); } }, [expiresAt, remaining]);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [pin, setPin] = useState('');
  function clearSecrets() { setPassword(''); setPin(''); }
  useEffect(() => { let active = true; read().then(rows => { if (active) setAccounts(rows); }).catch(() => {}).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [read]);
  useEffect(() => { if (!accounts) return; const timer = window.setInterval(() => { read().then(rows => { setAccounts(rows); if (!rows) setError('Your session has expired. Request a new secure password.'); }).catch(() => { setAccounts(null); }); }, 30_000); return () => window.clearInterval(timer); }, [accounts, read]);
  async function submit(action: 'request' | 'login') {
    setError('');
    const parsed = (action === 'request' ? manualAccessRequestSchema : manualAccessLoginSchema).safeParse({ email, password, pin });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Check your details.'); return; }
    setBusy(true);
    try {
      if (action === 'request') { await requestAccess({ data: { email } }); clearSecrets(); setSent(true); }
      else {
        await login({ data: { email, password, pin } });
        clearSecrets(); setAccounts(await read());
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  return <main className="min-h-dvh bg-background text-foreground px-4 py-8 sm:px-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6 mb-8"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-lg bg-gradient-primary"><KeyRound className="size-5 text-primary-foreground" /></div><div><Link to="/" className="text-xs text-muted-foreground">BM Support</Link><h1 className="font-display text-2xl font-bold">My credentials</h1></div></div>{accounts && <Button variant="outline" onClick={async () => { await logout(); setAccounts(null); setSent(false); setEmail(''); clearSecrets(); }}><LogOut /> Sign out</Button>}</header>
    <div className="rounded-2xl overflow-hidden border border-purple-500/30 bg-purple-950/50 backdrop-blur shadow-[0_0_60px_-15px_rgba(168,85,247,0.5)] mb-8"><div className="grid min-w-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="aspect-video min-w-0 overflow-hidden md:aspect-auto"><img src={tvLoginIllustration} alt="Customer relaxing on a sofa logging into their TV app" width={1920} height={1080} className="h-full w-full object-cover" /></div>
      <div className="min-w-0 p-4 flex flex-col justify-center text-white bg-gradient-to-br from-fuchsia-600/20 via-purple-600/20 to-violet-700/20 sm:p-6"><p className="text-xs uppercase tracking-[0.2em] text-fuchsia-200/80 mb-2">Your TV Credentials</p><h3 className="font-display text-2xl font-bold bg-gradient-to-r from-violet-200 to-blue-200 bg-clip-text text-transparent">Sign in to your TV app</h3><p className="mt-3 text-sm text-purple-100/90">Grab your remote, head to the BM Support app on your TV, and use the credentials below to sign in. Keep them private — your password unlocks everything.</p>
        {!loading && !accounts && <div className="mt-5"><p className="mb-4 rounded-md border border-border bg-surface-2 p-3 text-sm">Access requires your emailed secure password and a separate <strong>6-digit PIN</strong> chosen by you. Set your PIN on your password-protected manual secure checkout page first. We never email your PIN. You'll have <strong>10 minutes</strong> to view your details, then you'll need to request new access.</p><form onSubmit={e => { e.preventDefault(); void submit(sent ? 'login' : 'request'); }} className="space-y-4"><label className="block text-sm">Order email<input aria-label="Order email" type="email" autoComplete="email" maxLength={254} required readOnly={sent} value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-surface-2 px-3 py-3" /></label>{sent && <><p role="status" className="text-sm text-muted-foreground">If your email matches a paid manual order, a secure password has been emailed to you. Check your spam folder too.</p><label className="block text-sm">Secure password<input aria-label="Secure password" type="password" autoComplete="one-time-code" maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-surface-2 px-3 py-3" /></label><label className="block text-sm">6-digit PIN<input aria-label="6-digit PIN" type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" minLength={6} maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-2 w-full rounded-md border border-border bg-surface-2 px-3 py-3" /></label><p className="text-xs text-muted-foreground">Forgotten your PIN? Contact BM Support. Email alone cannot reset it.</p></>}<Button className="w-full" disabled={busy} type="submit">{busy ? <Loader2 className="animate-spin" /> : sent ? <KeyRound /> : <Mail />}{sent ? 'View my credentials' : 'Request secure password'}</Button>{sent && <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => submit('request')}>Request a new password</Button>}</form></div>}
      </div></div></div>
    {loading ? <Loader2 className="mx-auto animate-spin" /> : accounts && <>{expiresAt && <div role="timer" className="mb-6 rounded-lg border border-border bg-surface p-4"><div className="flex items-center justify-between text-sm"><span>This page closes automatically for your security</span><span className="font-mono text-lg font-semibold text-primary">{Math.floor(remaining / 60000)}:{String(Math.floor(remaining / 1000) % 60).padStart(2, '0')}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-1000" style={{ width: `${(remaining / 600000) * 100}%` }} /></div></div>}<ManualCredentialCards customers={[{ userId: 'my-manual-orders', displayName: accounts[0]?.name || 'My accounts', accounts }]} />{accounts.length === 0 && <p>No login details have been saved yet.</p>}</>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </div></main>;
}
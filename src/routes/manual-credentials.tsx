import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { KeyRound, Lock, Mail, LogOut, Loader2 } from 'lucide-react';
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
  const [accounts, setAccounts] = useState<ManualCredential[] | null>(null);
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => { let active = true; read().then(rows => { if (active) setAccounts(rows); }).catch(() => {}).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [read]);
  useEffect(() => { if (!accounts) return; const timer = window.setInterval(() => { read().then(rows => { setAccounts(rows); if (!rows) setError('Your session has expired. Request a new secure password.'); }).catch(() => { setAccounts(null); }); }, 30_000); return () => window.clearInterval(timer); }, [accounts, read]);
  async function submit(action: 'request' | 'login') {
    setError('');
    const parsed = (action === 'request' ? manualAccessRequestSchema : manualAccessLoginSchema).safeParse({ email, password });
    if (!parsed.success) { setError(action === 'request' ? 'Enter a valid order email address.' : 'Enter your order email and the secure password from the email.'); return; }
    setBusy(true);
    try { if (action === 'request') { await requestAccess({ data: { email } }); setSent(true); } else { await login({ data: { email, password } }); setPassword(''); setAccounts(await read()); } } catch (e) { setError(e instanceof Error ? e.message : 'Please try again.'); } finally { setBusy(false); }
  }
  return <main className="min-h-dvh bg-background text-foreground px-4 py-8 sm:px-8"><div className="mx-auto max-w-7xl">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-6 mb-8"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-lg bg-gradient-primary"><KeyRound className="size-5 text-primary-foreground" /></div><div><Link to="/" className="text-xs text-muted-foreground">BM Support</Link><h1 className="font-display text-2xl font-bold">My credentials</h1></div></div>{accounts && <Button variant="outline" onClick={async () => { await logout(); setAccounts(null); setSent(false); setEmail(''); }}><LogOut /> Sign out</Button>}</header>
    {loading ? <Loader2 className="mx-auto animate-spin" /> : accounts ? <><ManualCredentialCards customers={[{ userId: 'my-manual-orders', displayName: accounts[0]?.name || 'My accounts', accounts }]} />{accounts.length === 0 && <p>No login details have been saved yet.</p>}</> : <div className="mx-auto max-w-md"><Lock className="size-8 text-primary mb-4" /><h2 className="font-display text-xl font-semibold mb-6">Secure access</h2><form onSubmit={e => { e.preventDefault(); void submit(sent ? 'login' : 'request'); }} className="space-y-4"><label className="block text-sm">Order email<input aria-label="Order email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-surface-2 px-3 py-3" /></label>{sent && <><p role="status" className="text-sm text-muted-foreground">If your email matches a paid manual order, a secure password has been emailed to you. Check your spam folder too.</p><label className="block text-sm">Secure password<input aria-label="Secure password" type="password" autoComplete="one-time-code" maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded-md border border-border bg-surface-2 px-3 py-3" /></label></>}<Button className="w-full" disabled={busy} type="submit">{busy ? <Loader2 className="animate-spin" /> : sent ? <KeyRound /> : <Mail />}{sent ? 'View my credentials' : 'Request secure password'}</Button>{sent && <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => submit('request')}>Request a new password</Button>}</form></div>}
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
  </div></main>;
}
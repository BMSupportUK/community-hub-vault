import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Check, Eye, EyeOff, Loader2, ShieldCheck, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import signupBackground from '@/assets/manual-account-signup.jpg';
import { manualAccountFieldsSchema, type ManualAccountFields } from '@/lib/manual-account-schema';

export function ManualAccountBackdrop({ children }: { children: ReactNode }) {
  return <main className="relative isolate min-h-dvh overflow-hidden bg-card text-card-foreground">
    <img src={signupBackground} alt="Digital illustration of a person creating an account on a laptop" width={1536} height={1024} className="absolute inset-0 -z-20 h-full w-full object-cover object-[65%_center] lg:object-center" />
    <div className="absolute inset-0 -z-10 bg-card/60 lg:bg-card/20" />
    <div className="mx-auto min-h-dvh w-full max-w-screen-2xl px-5 py-8 sm:px-10 lg:px-16">{children}</div>
  </main>;
}

export function ManualAccountCreation({ demo = false, orderRef, onSubmit }: { demo?: boolean; orderRef?: string; onSubmit?: (fields: ManualAccountFields & { sitePassword: string }) => Promise<{ confirmationRequired: boolean }> }) {
  const [username, setUsername] = useState(''), [displayName, setDisplayName] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [pin, setPin] = useState(''), [sitePassword, setSitePassword] = useState('');
  const [showPin, setShowPin] = useState(false), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(true), [error, setError] = useState('');
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setError('');
    const parsed = manualAccountFieldsSchema.safeParse({ username, displayName, gender, pin });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message || 'Complete every field.'); return; }
    if (sitePassword.length < 10) { setError('Choose a site password with at least 10 characters.'); return; }
    setBusy(true);
    try {
      if (!demo) {
        if (!onSubmit) throw new Error('Please reopen your secure order.');
        const result = await onSubmit({ ...parsed.data, sitePassword }); setConfirmationRequired(result.confirmationRequired);
      }
      setPin(''); setSitePassword(''); setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Your account could not be created. Please try again.'); }
    finally { setBusy(false); }
  }
  return <ManualAccountBackdrop>
    <div className="mb-8 flex flex-wrap items-center gap-3 text-sm"><ShieldCheck className="size-6 text-success" /><span className="font-display text-xl font-bold">BM Support</span>{demo && <span className="rounded-md border border-border bg-card/90 px-2 py-1 text-xs font-medium">Demo · no account is created</span>}</div>
    <div className="w-full max-w-md lg:max-w-lg">
      <div className="mb-7 flex items-center gap-2 text-sm font-medium"><Check className="size-4 text-success" /> Order complete <span className="text-muted-foreground">/</span> Final step{orderRef && <span className="ml-auto text-xs">#{orderRef}</span>}</div>
      {done ? <div className="space-y-5 rounded-lg bg-card/95 p-6 sm:p-8">
        <ShieldCheck className="size-12 text-success" />
        <h1 className="font-display text-3xl font-bold">{demo ? 'Your demo is complete' : 'Your account is created'}</h1>
        <p className="text-sm text-muted-foreground">{demo ? 'No account, order or PIN has been saved.' : confirmationRequired ? 'Check the email address saved on your order and confirm your email, then sign in. Your credentials PIN stays private.' : 'Sign in with the email address saved on your order and your new site password.'}</p>
        {demo ? <Button onClick={() => setDone(false)} variant="outline">Try the demo again</Button> : <Button asChild><Link to="/login">Sign in to my account</Link></Button>}
      </div> : <>
        <div className="mb-6"><h1 className="font-display text-3xl font-bold sm:text-4xl">Create your<br />BM Support account</h1><p className="mt-3 max-w-sm text-sm leading-relaxed">Your service is ready. Finish your profile and protect your login credentials.</p></div>
        <form onSubmit={submit} className="space-y-5 rounded-lg border border-border/60 bg-card/95 p-5 sm:p-7">
          <div className="space-y-4">
            <label className="block text-sm font-medium">Username <span className="text-destructive">*</span><input required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_]+" autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Choose your username" className="mt-2 h-11 w-full rounded-md border border-border bg-input px-3 text-foreground outline-none focus:ring-2 focus:ring-ring" /></label>
            <label className="block text-sm font-medium">Display name <span className="text-destructive">*</span><input required maxLength={80} autoComplete="nickname" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Name shown on your profile" className="mt-2 h-11 w-full rounded-md border border-border bg-input px-3 text-foreground outline-none focus:ring-2 focus:ring-ring" /></label>
            <fieldset><legend className="mb-2 text-sm font-medium">Male or female <span className="text-destructive">*</span></legend><div className="grid grid-cols-2 gap-3">{(['male', 'female'] as const).map(value => <label key={value} className={`flex h-11 cursor-pointer items-center gap-3 rounded-md border px-3 text-sm ${gender === value ? 'border-primary bg-primary/10' : 'border-border bg-input'}`}><input required type="radio" name="gender" value={value} checked={gender === value} onChange={() => setGender(value)} className="accent-primary" />{value === 'male' ? 'Male' : 'Female'}</label>)}</div></fieldset>
            <label className="block text-sm font-medium">Credentials PIN <span className="text-destructive">*</span><div className="relative mt-2"><input required aria-label="Credentials PIN" type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} autoComplete="off" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="6 digits" className="h-11 w-full rounded-md border border-border bg-input pl-3 pr-12 font-mono text-foreground outline-none focus:ring-2 focus:ring-ring" /><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-0.5" aria-label={showPin ? 'Hide PIN' : 'Show PIN'} title={showPin ? 'Hide PIN' : 'Show PIN'} onClick={() => setShowPin(!showPin)}>{showPin ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button></div><span className="mt-2 block text-xs font-normal leading-relaxed text-muted-foreground">Use this PIN with your emailed secure password to view your login details for 10 minutes. We never email your PIN. If you already set one, enter the same PIN.</span></label>
            <label className="block text-sm font-medium">Site password <span className="text-destructive">*</span><input required type="password" minLength={10} maxLength={128} autoComplete="new-password" value={sitePassword} onChange={e => setSitePassword(e.target.value)} placeholder="At least 10 characters" className="mt-2 h-11 w-full rounded-md border border-border bg-input px-3 text-foreground outline-none focus:ring-2 focus:ring-ring" /><span className="mt-2 block text-xs font-normal text-muted-foreground">Your site account uses the email address saved on your order.</span></label>
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="h-12 w-full">{busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}{busy ? 'Creating your account…' : 'Create account'}</Button>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Your PIN is stored securely and never shared.</p>
        </form>
      </>}
    </div>
  </ManualAccountBackdrop>;
}
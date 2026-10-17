import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getManualCheckoutPinStatus, setManualCheckoutPin } from '@/lib/manual-credentials.functions';
import { manualAccessPinSetupSchema } from '@/lib/manual-credentials-schema';

export function ManualCheckoutPin({ token, password }: { token: string; password: string }) {
  const status = useServerFn(getManualCheckoutPinStatus), save = useServerFn(setManualCheckoutPin);
  const [configured, setConfigured] = useState(false), [checking, setChecking] = useState(true), [busy, setBusy] = useState(false);
  const [pin, setPin] = useState(''), [confirmPin, setConfirmPin] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    status({ data: { token, password } }).then(result => { if (active) setConfigured(result.configured); }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Your PIN status could not be checked.'); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [token, password, status]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError('');
    const input = manualAccessPinSetupSchema.safeParse({ token, password, pin, confirmPin });
    if (!input.success) { setError(input.error.issues[0]?.message || 'Check your PIN.'); return; }
    setBusy(true);
    try { await save({ data: input.data }); setConfigured(true); setPin(''); setConfirmPin(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'Your PIN could not be saved.'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Private credentials PIN" className="space-y-4 rounded-lg border border-border bg-surface p-5">
    <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><ShieldCheck className="size-5 text-primary" /> Private credentials PIN</h2>
    {checking ? <Loader2 aria-label="Checking PIN" className="size-5 animate-spin" /> : configured ? <>
      <p role="status" className="text-sm text-success">Your PIN is set. Keep it private — we never email it.</p>
      <Link to="/manual-credentials" className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline">View my credentials</Link>
    </> : <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">Choose a 6-digit PIN to protect your login details. You'll need it alongside your emailed secure password for each 10-minute visit.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">Choose PIN<input aria-label="Choose PIN" type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" minLength={6} maxLength={6} required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3" /></label>
        <label className="block text-sm">Confirm PIN<input aria-label="Confirm PIN" type="password" inputMode="numeric" pattern="[0-9]{6}" autoComplete="off" minLength={6} maxLength={6} required value={confirmPin} onChange={e => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))} className="mt-2 h-11 w-full rounded-md border border-border bg-background px-3" /></label>
      </div>
      <Button type="submit" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Set my PIN</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
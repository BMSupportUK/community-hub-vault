import { useEffect, useId, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { CreditCard, Loader2, LockKeyhole, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { billingCountries } from '@/lib/billing-countries';
import { loadSquareCardSdk, warmSquareCardEntry, type SquareCard } from '@/lib/square-card-sdk';
import { checkoutSquareCharge, checkoutSquareConfig, checkoutSquareStatus } from '@/lib/checkout-pay.functions';

export function SquareCardPayment({ token, password, onPaid }: { token: string; password: string; onPaid: () => void | Promise<void> }) {
  const config = useServerFn(checkoutSquareConfig);
  const charge = useServerFn(checkoutSquareCharge);
  const checkStatus = useServerFn(checkoutSquareStatus);
  const id = `square-card-${useId().replace(/:/g, '')}`;
  const card = useRef<SquareCard | null>(null);
  const source = useRef<string | null>(null);
  const inFlight = useRef(false);
  const callback = useRef(onPaid); callback.current = onPaid;
  const [ready, setReady] = useState(false);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [country, setCountry] = useState('GB');
  useEffect(() => {
    let active = true;
    let attached: SquareCard | null = null;
    setReady(false); setError(null);
    warmSquareCardEntry();
    void (async () => {
      try {
        const settings = await config({ data: { token, password } });
        if (!active) return;
        setAmount(settings.amountCents);
        const sdk = await loadSquareCardSdk(settings.environment);
        if (!active) return;
        attached = await sdk.payments(settings.applicationId, settings.locationId).card();
        if (!active) { await attached.destroy(); return; }
        await attached.attach(`#${id}`);
        if (active) { card.current = attached; setAmount(settings.amountCents); setReady(true); }
      } catch (e) { if (active) setError(e instanceof Error ? e.message : 'Card entry could not load'); }
    })();
    return () => { active = false; card.current = null; if (attached) void attached.destroy(); };
  }, [token, password, retry, id]);

  async function check() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const result = await checkStatus({ data: { token, password } });
      if (result.paid) await callback.current();
      else { setPending(['APPROVED', 'PENDING', 'CONFIRMATION_PENDING'].includes(result.status)); setError('Payment is not confirmed yet. If you already submitted a card, do not pay again.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not check payment'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => { void check(); }, 15000);
    return () => window.clearInterval(timer);
  }, [pending, token, password]);

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!card.current || inFlight.current || pending) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      if (!source.current) {
        const result = await card.current.tokenize({
          amount: (amount / 100).toFixed(2), currencyCode: 'GBP', intent: 'CHARGE',
          customerInitiated: true, sellerKeyedIn: false,
          billingContact: { givenName: givenName.trim(), familyName: familyName.trim(), countryCode: country.trim().toUpperCase() },
        });
        if (result.status !== 'OK' || !result.token) throw new Error(result.errors?.map(e => e.message).filter(Boolean).join(' ') || 'Check your card details and try again.');
        source.current = result.token;
      }
      const result = await charge({ data: { token, password, sourceId: source.current } });
      if (result.paid) await callback.current();
      else { setPending(true); setError('Square is confirming your payment. Do not pay again.'); }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not confirm the payment. Do not pay again.';
      // Only a definitive rejection permits collecting a fresh card token.
      if (/Square 4\d\d:/.test(message) && !/Square (408|409|429):/.test(message)) source.current = null;
      setError(message);
    } finally { inFlight.current = false; setBusy(false); }
  }
  return <form onSubmit={pay} className="space-y-4" aria-label="Square card payment">
    <h3 className="flex items-center gap-2 font-semibold"><CreditCard className="size-5 text-primary" />Card payment</h3>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`${id}-first`}>First name on card</Label><Input id={`${id}-first`} value={givenName} onChange={e => setGivenName(e.target.value)} autoComplete="cc-given-name" maxLength={100} required disabled={busy || pending} /></div>
      <div className="space-y-1"><Label htmlFor={`${id}-last`}>Last name on card</Label><Input id={`${id}-last`} value={familyName} onChange={e => setFamilyName(e.target.value)} autoComplete="cc-family-name" maxLength={100} required disabled={busy || pending} /></div>
    </div>
    <div className="space-y-1"><Label htmlFor={`${id}-country`}>Billing country</Label><Select value={country} onValueChange={setCountry} name="billing-country" required disabled={busy || pending}><SelectTrigger id={`${id}-country`} className="w-full"><SelectValue /></SelectTrigger><SelectContent>{billingCountries.map(c => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}</SelectContent></Select></div>
    <div id={id} className="min-h-32 w-full rounded-md bg-card" />
    {!ready && !error && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading secure card entry…</p>}
    <Button type="submit" className="min-h-11 w-full" disabled={!ready || busy || pending}>{busy ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}{pending ? 'Confirming payment…' : busy ? 'Processing…' : `Pay £${(amount / 100).toFixed(2)}`}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {error && !ready && <Button type="button" variant="outline" onClick={() => setRetry(n => n + 1)}><RefreshCw className="size-4" />Reload card entry</Button>}
    {(pending || error && ready) && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void check()}><RefreshCw className="size-4" />Check payment status</Button>}
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="size-3.5 shrink-0" />Secured by Square</p>
  </form>;
}
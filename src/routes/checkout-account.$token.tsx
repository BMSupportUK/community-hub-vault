import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ManualAccountBackdrop, ManualAccountCreation } from '@/components/checkout/ManualAccountCreation';
import { getCheckout } from '@/lib/checkout.functions';
import { createManualCheckoutAccount } from '@/lib/manual-account.functions';
import { canCreateManualAccount } from '@/lib/manual-account-schema';

export const Route = createFileRoute('/checkout-account/$token')({
  head: () => ({ meta: [
    { title: 'Finish your account — BM Support' }, { name: 'description', content: 'Complete your private manual-order profile and credentials PIN.' },
    { property: 'og:title', content: 'Finish your account — BM Support' }, { property: 'og:description', content: 'Complete your private manual-order profile and credentials PIN.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' }, { name: 'robots', content: 'noindex, nofollow' },
  ] }), component: CheckoutAccountPage,
});
function CheckoutAccountPage() {
  const { token } = Route.useParams();
  const fetchCheckout = useServerFn(getCheckout), createAccount = useServerFn(createManualCheckoutAccount);
  const [password, setPassword] = useState(''), [input, setInput] = useState(''), [ref, setRef] = useState('');
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function open(pw: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('This secure link is not valid.');
    const result = await fetchCheckout({ data: { token, password: pw } });
    if (!result.ok) throw new Error('Check the password supplied with your secure order.');
    if (!canCreateManualAccount(result.order)) throw new Error('This step is available only after your manual order is complete, unless account creation was bypassed.');
    setPassword(pw); setRef(result.order.ref); setReady(true);
  }
  useEffect(() => {
    const saved = sessionStorage.getItem(`bm-pay-${token}`);
    if (!saved) { setChecking(false); return; }
    open(saved).catch(cause => setError(cause instanceof Error ? cause.message : 'Your order could not be opened.')).finally(() => setChecking(false));
  }, [token]);
  if (checking) return <ManualAccountBackdrop><Loader2 aria-label="Opening final step" className="size-8 animate-spin text-primary" /></ManualAccountBackdrop>;
  if (!ready) return <ManualAccountBackdrop><form onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await open(input.trim()); sessionStorage.setItem(`bm-pay-${token}`, input.trim()); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); } finally { setBusy(false); } }} className="mt-16 w-full max-w-md space-y-5 rounded-lg border border-border bg-card/95 p-6"><Lock className="size-8 text-primary" /><h1 className="font-display text-2xl font-bold">Finish your account</h1><label className="block text-sm">Secure order password<input required maxLength={64} type="password" autoComplete="off" value={input} onChange={e => setInput(e.target.value)} className="mt-2 h-11 w-full rounded-md border border-border bg-input px-3" /></label>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button disabled={busy} type="submit" className="w-full">{busy ? 'Opening…' : 'Open final step'}</Button><Link to="/pay/$token" params={{ token }} className="block text-sm text-primary underline">Back to my order</Link></form></ManualAccountBackdrop>;
  return <ManualAccountCreation orderRef={ref} onSubmit={async fields => {
    const result = await createAccount({ data: { token, password, ...fields } });
    localStorage.setItem('bm-checkout-claim', token);
    return result;
  }} />;
}
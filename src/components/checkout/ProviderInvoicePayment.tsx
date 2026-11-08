import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ExternalLink, Loader2, RefreshCw, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { checkoutProviderInvoice, orderProviderInvoice, refreshOrderProviderInvoice, refreshCheckoutProviderInvoice } from '@/lib/provider-invoices.functions';
import { getStripeEnvironment } from '@/lib/stripe';
import { Link } from '@tanstack/react-router';
import { SquareCardPayment } from './SquareCardPayment';
import { getSquareCheckoutLink } from '@/lib/square-checkout-link.functions';
type PaymentProps = {
 method: 'square' | 'stripe'; amountCents: number; orderId?: string; token?: string; password?: string; onPaid?: () => void | Promise<void>;
};
export function ProviderInvoicePayment(props: PaymentProps) {
 if (props.method === 'square') {
  if (props.token) return <SquareCardPayment token={props.token} password={props.password ?? ''} onPaid={props.onPaid ?? (() => {})} />;
  return <SquareCheckoutLink orderId={props.orderId} amountCents={props.amountCents} />;
 }
 return <InvoicePayment {...props} />;
}
function SquareCheckoutLink({ orderId, amountCents }: { orderId?: string; amountCents: number }) {
 const getLink = useServerFn(getSquareCheckoutLink);
 const [token, setToken] = useState<string | null>(null);
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState<string | null>(null);
 async function open() {
  if (!orderId || busy) return;
  setBusy(true); setError(null);
  try { const link = await getLink({ data: { orderId } }); setToken(link.token); }
  catch(e) { setError(e instanceof Error ? e.message : 'Could not open payment'); }
  finally { setBusy(false); }
 }
 return <div className="space-y-3">{token ? <Button asChild className="w-full min-h-11"><Link to="/pay/$token" params={{ token }}>Open secure card payment</Link></Button> : <Button className="w-full min-h-11" disabled={busy || !orderId} onClick={() => void open()}>{busy && <Loader2 className="size-4 animate-spin"/>}Pay £{(amountCents / 100).toFixed(2)} by card</Button>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}
function InvoicePayment({ method, amountCents, orderId, token, password = '', onPaid }: PaymentProps) {
 const guest = useServerFn(checkoutProviderInvoice);
 const member = useServerFn(orderProviderInvoice);
 const refresh = useServerFn(refreshOrderProviderInvoice);
 const refreshGuest = useServerFn(refreshCheckoutProviderInvoice);
 const paidCallback = useRef(onPaid);
 paidCallback.current = onPaid;
 const [status,setStatus] = useState('');
 const [url,setUrl] = useState<string | null>(null);
 const [invoiceProvider,setInvoiceProvider] = useState(method === 'square' ? 'Square' : 'Stripe');
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState<string | null>(null);
 const provider = method === 'square' ? 'Square' : 'Stripe';
 async function generate() {
  setBusy(true); setError(null);
  try {
   const options = { method, environment: getStripeEnvironment() };
   const result = token ? await guest({ data: { ...options, token, password } }) : orderId ? await member({ data: { ...options, orderId } }) : null;
   if (!result) throw new Error('Order not found');
   if ('error' in result) throw new Error(result.error);
   setUrl(result.public_url);
  } catch(e) { setError(e instanceof Error ? e.message : 'Could not prepare invoice'); }
  finally { setBusy(false); }
 }
 async function check(manual = true) {
  if (manual) { setBusy(true); setError(null); }
  try {
   const result = token ? await refreshGuest({ data: { token, password } }) : orderId ? await refresh({ data: { orderId } }) : null;
   if (!result) return;
   if ('error' in result) throw new Error(result.error);
   if (['open','unpaid','scheduled','payment_pending','partially_paid'].includes(result.status.toLowerCase())) {
    setUrl(result.public_url);
    setInvoiceProvider(result.provider === 'square' ? 'Square' : 'Stripe');
   } else setUrl(null);
   if (result.paid) { setStatus('Payment confirmed'); await paidCallback.current?.(); }
   else if (manual) setStatus('Payment not confirmed yet');
  } catch(e) { if (manual) setError(e instanceof Error ? e.message : 'Could not check payment'); }
  finally { if (manual) setBusy(false); }
 }
 useEffect(() => {
  setUrl(null); setStatus(''); setError(null);
  void check(false);
  const timer = window.setInterval(() => { void check(false); }, 15000);
  const focus = () => { void check(false); };
  window.addEventListener('focus', focus);
  return () => { window.clearInterval(timer); window.removeEventListener('focus', focus); };
 }, [token, password, orderId, method]);
 return <div className="space-y-3">
  {url ? <>
   <Button asChild className="w-full min-h-11"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4"/>View invoice</a></Button>
   <Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={() => void check()}><RefreshCw className="size-4"/>{busy ? 'Checking…' : "I've paid — check payment"}</Button>
  </> : <Button className="w-full min-h-11" disabled={busy} onClick={generate}>{busy ? <Loader2 className="size-4 animate-spin"/> : <Receipt className="size-4"/>}{busy ? 'Preparing invoice…' : `Pay £${(amountCents / 100).toFixed(2)} via ${provider}`}</Button>}
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
 </div>;
}

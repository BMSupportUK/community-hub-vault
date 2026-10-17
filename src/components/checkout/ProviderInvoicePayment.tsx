import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { ExternalLink, Loader2, RefreshCw, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { checkoutProviderInvoice, orderProviderInvoice, refreshOrderProviderInvoice } from '@/lib/provider-invoices.functions';
import { getStripeEnvironment } from '@/lib/stripe';
export function ProviderInvoicePayment({ method, amountCents, orderId, token, password = '', onPaid }: {
 method: 'square' | 'stripe'; amountCents: number; orderId?: string; token?: string; password?: string; onPaid?: () => void | Promise<void>;
}) {
 const guest = useServerFn(checkoutProviderInvoice);
 const member = useServerFn(orderProviderInvoice);
 const refresh = useServerFn(refreshOrderProviderInvoice);
 const [url,setUrl] = useState<string | null>(null);
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
 async function check() {
  setBusy(true); setError(null);
  try {
   if (orderId) { const result = await refresh({ data: { orderId } }); if ('error' in result) throw new Error(result.error); }
   await onPaid?.();
  } catch(e) { setError(e instanceof Error ? e.message : 'Could not check payment'); }
  finally { setBusy(false); }
 }
 return <div className="space-y-3">
  {url ? <>
   <Button asChild className="w-full min-h-11"><a href={url} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4"/>Pay {provider} invoice</a></Button>
   <Button variant="outline" className="w-full min-h-11" disabled={busy} onClick={check}><RefreshCw className="size-4"/>{busy ? 'Checking…' : "I've paid — check payment"}</Button>
  </> : <Button className="w-full min-h-11" disabled={busy} onClick={generate}>{busy ? <Loader2 className="size-4 animate-spin"/> : <Receipt className="size-4"/>}{busy ? 'Preparing invoice…' : `Pay £${(amountCents / 100).toFixed(2)} via ${provider}`}</Button>}
  {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}

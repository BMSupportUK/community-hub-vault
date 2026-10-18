import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { checkoutCryptoInvoice } from '@/lib/checkout-pay.functions';
import { ProviderInvoicePayment } from '@/components/checkout/ProviderInvoicePayment';
export function CheckoutCardPayment({ token, password, method, amountCents, onPaid }: {
 token: string; password: string; method: 'square' | 'stripe' | 'crypto'; amountCents: number; onPaid: () => void | Promise<void>;
}) {
 if (method === 'crypto') return <CryptoPay token={token} password={password} amountCents={amountCents}/>;
 // Card invoices always go through Square; Stripe is used only for open-banking Pay by bank.
 return <ProviderInvoicePayment key="square" token={token} password={password} method="square" amountCents={amountCents} onPaid={onPaid}/>;
}

function CryptoPay({ token, password, amountCents }: { token: string; password: string; amountCents: number }) {
  const create = useServerFn(checkoutCryptoInvoice);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const start = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await create({ data: { token, password } });
      if ("error" in r) setErr(r.error); else setUrl(r.invoiceUrl);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (url) {
    return (
      <div className="space-y-2">
        <iframe src={url} title="Crypto payment" className="w-full h-[640px] rounded-xl border border-border bg-background" allow="clipboard-write" />
        <a href={url} target="_blank" rel="noreferrer" className="block text-center text-xs text-primary hover:underline">Open the payment in a new tab</a>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <button type="button" onClick={start} disabled={busy} className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-semibold disabled:opacity-50">
        {busy ? "Preparing payment…" : `Pay £${(amountCents / 100).toFixed(2)} in USDT`}
      </button>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}

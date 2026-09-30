import { useCallback, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { SquareCardPanel } from "@/components/app/SquareCardPanel";
import { checkoutCryptoInvoice, checkoutSquareCharge, checkoutSquareConfig, checkoutStripeSession } from "@/lib/checkout-pay.functions";

const stripeSecrets = new Map<string, Promise<string>>();

/** Inline card payment for the secure checkout page (Square or Stripe). */
export function CheckoutCardPayment({ token, password, method, amountCents, onPaid }: {
  token: string; password: string; method: "square" | "stripe" | "crypto"; amountCents: number; onPaid: () => void | Promise<void>;
}) {
  const cfg = useServerFn(checkoutSquareConfig);
  const charge = useServerFn(checkoutSquareCharge);
  const stripeSession = useServerFn(checkoutStripeSession);

  const getConfigOverride = useCallback(() => cfg({ data: { token, password } }), [cfg, token, password]);
  const chargeOverride = useCallback(
    (args: { data: { orderId: string; sourceId: string } }) => charge({ data: { token, password, sourceId: args.data.sourceId } }),
    [charge, token, password],
  );

  const stripeOptions = useMemo(() => ({
    // One session per page load: a remount (dev double-render, re-render of the
    // sidebar) must reuse it, otherwise the second request expires the session
    // the card form is showing and Stripe says "Something went wrong".
    fetchClientSecret: () => {
      const cached = stripeSecrets.get(token);
      if (cached) return cached;
      const p = (async () => {
        const r = await stripeSession({ data: { token, password, environment: getStripeEnvironment(), returnUrl: window.location.href } });
        if ("error" in r) throw new Error(r.error);
        return r.clientSecret;
      })();
      stripeSecrets.set(token, p);
      p.catch(() => stripeSecrets.delete(token));
      return p;
    },
    onComplete: () => { void onPaid(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [token, password]);

  if (method === "crypto") return <CryptoPay token={token} password={password} amountCents={amountCents} />;
  if (method === "square") {
    return (
      <SquareCardPanel
        orderId={token}
        amountCents={amountCents}
        canPay
        onChange={onPaid}
        getConfigOverride={getConfigOverride}
        chargeOverride={chargeOverride}
      />
    );
  }
  return (
    <div className="rounded-xl overflow-hidden">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={stripeOptions}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
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

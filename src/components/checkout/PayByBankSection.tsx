import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { Landmark, Loader2 } from "lucide-react";
import { checkoutStripeSession } from "@/lib/checkout-pay.functions";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { PAY_BY_BANK_BANKS, PAY_BY_BANK_INTRO, PAY_BY_BANK_NOTE } from "@/lib/pay-by-bank";

/**
 * Pay by Bank (open banking) on the secure checkout card-invoice sidebar.
 * Creates a Stripe Checkout session restricted to pay_by_bank and embeds it
 * inline; the manual bank transfer system is unaffected.
 */
export function PayByBankSection({ token, password, preview = false }: { token: string; password: string; preview?: boolean }) {
  const createSession = useServerFn(checkoutStripeSession);
  const [paying, setPaying] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const stripeReady = useMemo(() => {
    try { getStripeEnvironment(); return true; } catch { return false; }
  }, []);

  const start = async () => {
    setPaying(true); setErr(null);
    try {
      const r = await createSession({
        data: {
          token,
          password,
          environment: getStripeEnvironment(),
          returnUrl: `${window.location.origin}${window.location.pathname}${window.location.search}`,
          bank: true,
        },
      });
      if ("error" in r) setErr(r.error);
      else setClientSecret(r.clientSecret);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPaying(false);
    }
  };

  if (!stripeReady) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-3">
        <Landmark className="size-5 text-primary shrink-0" />
        <div className="min-w-0">
          <h2 className="font-semibold">Pay by bank</h2>
          <p className="text-xs text-muted-foreground">{PAY_BY_BANK_INTRO}</p>
        </div>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5">Supported banks:</p>
        <ul className="flex flex-wrap gap-1.5" aria-label="Banks supported by Pay by Bank">
          {PAY_BY_BANK_BANKS.map((b) => (
            <li key={b} className="rounded-full border border-border bg-surface-2 px-2.5 py-0.5 text-xs text-foreground">{b}</li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">{PAY_BY_BANK_NOTE}</p>
      </div>
      {clientSecret ? (
        <div id="pay-by-bank-checkout">
          <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret: () => Promise.resolve(clientSecret) }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      ) : (
        <button type="button" onClick={start} disabled={paying || preview} className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60">
          {paying ? <Loader2 className="size-4 animate-spin" /> : <Landmark className="size-4" />}
          {paying ? "Opening your bank…" : "Pay by bank"}
        </button>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
    </section>
  );
}

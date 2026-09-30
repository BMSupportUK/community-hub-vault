import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, Lock, ShieldCheck } from "lucide-react";
import { getCheckout } from "@/lib/checkout.functions";
import { CheckoutTemplate, type CheckoutView } from "@/components/checkout/CheckoutTemplate";
import { CustomerCheckoutChat } from "@/components/checkout/CheckoutChat";
import { CheckoutCardPayment } from "@/components/checkout/CheckoutCardPayment";
import { useAuth } from "@/hooks/use-auth";
import hero from "@/assets/checkout-family-tv.jpg";

export const Route = createFileRoute("/pay/$token")({
  head: () => ({
    meta: [
      { title: "Secure checkout — BM Support" },
      { name: "description", content: "Your private, password-protected BM Support order and payment page." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Secure checkout — BM Support" },
      { property: "og:description", content: "Your private, password-protected BM Support order and payment page." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayPage,
});

function PayPage() {
  const { token } = Route.useParams();
  const { user } = useAuth();
  const fetchCheckout = useServerFn(getCheckout);
  const [password, setPassword] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [view, setView] = useState<CheckoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const key = `bm-pay-${token}`;

  const load = useCallback(async (pw: string) => {
    const r = await fetchCheckout({ data: { token, password: pw } });
    if (!r.ok) return false;
    setView({ order: r.order, items: r.items, invoice: r.invoice, bank: r.bank });
    return true;
  }, [fetchCheckout, token]);

  useEffect(() => {
    if (!validToken) return;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      load(saved).then((ok) => { if (ok) { setPassword(saved); setUnlocked(true); } else sessionStorage.removeItem(key); });
      return;
    }
    // Shop orders unlock with the link alone — try it before showing the
    // password form (only manual orders need one).
    load("").then((ok) => { if (ok) { setPassword(""); setUnlocked(true); } });
  }, [key, load, validToken]);

  // Keep the page live so payment / completion show without a refresh.
  useEffect(() => {
    if (!unlocked || password === null) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") load(password); }, 20000);
    const onFocus = () => load(password);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [unlocked, password, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validToken) return setError("This link is not valid.");
    setBusy(true); setError(null);
    const pw = input.trim();
    try {
      const ok = await load(pw);
      if (ok) { sessionStorage.setItem(key, pw); setPassword(pw); setUnlocked(true); }
      else setError("That password is not correct. Check the password you were given with this link.");
    } catch { setError("Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  if (!unlocked || !view) {
    return (
      <main className="min-h-screen grid place-items-center bg-background px-5 py-10">
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-border bg-card overflow-hidden text-center">
          <img src={hero} alt="Family watching TV together" className="w-full aspect-[16/9] object-cover" />
          <div className="p-6 space-y-4">
            <div className="mx-auto size-12 rounded-full bg-primary/15 text-primary grid place-items-center"><Lock className="size-6" /></div>
            <div className="space-y-1.5">
              <h1 className="font-display text-xl font-bold">Secure checkout</h1>
              <p className="text-sm text-muted-foreground">
                This is your private, secure checkout page for your BM Support order. To view your order and pay,
                enter the password that was supplied to you with this link.
              </p>
            </div>
            <input value={input} onChange={(e) => setInput(e.target.value)} autoComplete="off" placeholder="XXXX-XXXX-XXXX" className="w-full h-11 rounded-lg border border-border bg-background px-3 text-center font-mono tracking-widest uppercase" aria-label="Password" />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <button type="submit" disabled={busy || !input.trim()} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="size-4 animate-spin" />} Open my order
            </button>
            <p className="text-xs text-muted-foreground inline-flex items-center justify-center gap-1.5">
              <ShieldCheck className="size-3.5" /> Only you can see this page — it is protected by your unique link and password.
            </p>
          </div>
        </form>
      </main>
    );
  }

  const pw = password ?? "";
  return (
    <main className="min-h-screen overflow-y-auto">
      <CheckoutTemplate
        view={view}
        claimToken={token}
        cardPayment={(view.order.method === "square" || view.order.method === "stripe" || view.order.method === "crypto") && !view.order.paidAt && !view.order.cancelled ? (
          <CheckoutCardPayment token={token} password={pw} method={view.order.method} amountCents={view.order.totalCents} onPaid={() => { load(pw); }} />
        ) : undefined}
      />
      <CustomerCheckoutChat token={token} password={pw} />
    </main>
  );
}

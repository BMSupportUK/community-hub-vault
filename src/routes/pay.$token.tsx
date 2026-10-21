import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, KeyRound, Loader2, Lock, ShieldCheck, UserCheck } from "lucide-react";
import { continueCheckoutToAccountSetup, getCheckout, markPaymentSent, startCheckoutAccountSetup } from "@/lib/checkout.functions";
import { switchCheckoutPayMethod } from "@/lib/checkout-pay.functions";
import { OrderVideoCallCustomer } from "@/components/checkout/OrderVideoCall";
import { OrderAppLogin } from "@/components/checkout/OrderAppLogin";
import { CheckoutTemplate, type CheckoutView } from "@/components/checkout/CheckoutTemplate";
import { CustomerCheckoutChat } from "@/components/checkout/CheckoutChat";
import { CheckoutCardPayment } from "@/components/checkout/CheckoutCardPayment";
import { PayByBankSection } from "@/components/checkout/PayByBankSection";
import { useAuth } from "@/hooks/use-auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SecureLinkPanel } from "@/components/checkout/ManualOrderLinkDialog";
import hero from "@/assets/checkout-family-tv.jpg";
import { toast } from "sonner";
import { DEMO_CHECKOUT_VIEW } from "@/lib/demo-data";
import { isMobilePhone } from "@/lib/is-mobile-phone";
import { isVideoTestOrder } from "@/lib/video-test-orders";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pay/$token")({
  validateSearch: (search: Record<string, unknown>): { pw?: string } => ({
    // Legacy links may carry a password, but never unlock automatically.
    pw: typeof search.pw === "string" ? search.pw : undefined,
  }),
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
  component: PayRoute,
});

function PayRoute() {
  const { token } = Route.useParams();
  return token === "demo" ? <DemoPayPage /> : token === "demo-payment" ? <DemoPayPage unpaid /> : <PayPage />;
}

/** Sample secure order for the demo account — no live data, actions do nothing. */
function DemoPayPage({ unpaid = false }: { unpaid?: boolean }) {
  const demoOnly = async () => { toast.info("This is a sample order on the demo account"); };
  return (
    <main className="min-h-screen overflow-y-auto">
      <div className="w-full px-3 pt-3">
        <Link to="/shop" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to my orders
        </Link>
      </div>
      <CheckoutTemplate view={(unpaid ? { ...DEMO_CHECKOUT_VIEW, canPayByBank: true, order: { ...DEMO_CHECKOUT_VIEW.order, method: "square", paidAt: null, paymentSentAt: null, status: "pending" } } : DEMO_CHECKOUT_VIEW) as CheckoutView} preview onSwitchPayMethod={demoOnly} onPaymentSent={demoOnly} onContinueToSetup={demoOnly} payByBank={<PayByBankSection token="demo" password="" preview />} />
    </main>
  );
}

function PayPage() {
  const { token } = Route.useParams();
  const { user, hasRole } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [movingToSetup, setMovingToSetup] = useState(false);
  const canManage = !!user && (hasRole("admin") || hasRole("management"));
  const canMoveToSetup = canManage;
  const fetchCheckout = useServerFn(getCheckout);
  const sendPaymentSent = useServerFn(markPaymentSent);
  const startAccountSetup = useServerFn(startCheckoutAccountSetup);
  const continueToAccountSetup = useServerFn(continueCheckoutToAccountSetup);
  const switchPayMethod = useServerFn(switchCheckoutPayMethod);
  const [password, setPassword] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState("");
  const [view, setView] = useState<CheckoutView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const validToken = /^[a-f0-9]{64}$/.test(token);
  const key = `bm-pay-${token}`;

  const load = useCallback(async (pw: string) => {
    const r = await fetchCheckout({ data: { token, password: pw } });
    if (!r.ok) return false;
    setView({ order: r.order, items: r.items, invoice: r.invoice, bank: r.bank, canPayByBank: Boolean((r as { canPayByBank?: boolean }).canPayByBank), qdCode: (r as { qdCode?: { label: string; code: string } | null }).qdCode ?? null });
    return true;
  }, [fetchCheckout, token]);

  useEffect(() => {
    if (!validToken) {
      setCheckingAccess(false);
      return;
    }
    // Require a fresh entry whenever the customer opens this order page.
    setPassword(null);
    setUnlocked(false);
    setView(null);
    setInput("");
    setCheckingAccess(false);
  }, [token, validToken]);

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

  if (checkingAccess) {
    return (
      <main className="min-h-screen grid place-items-center bg-background" aria-label="Opening secure checkout">
        <Loader2 className="size-8 animate-spin text-primary" />
      </main>
    );
  }

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
            <Button type="submit" disabled={busy || !input.trim()} className="w-full h-11 rounded-lg font-semibold gap-2">
              {busy && <Loader2 className="size-4 animate-spin" />} Open my order
            </Button>
            <Button asChild variant="outline" className="w-full h-11 rounded-lg font-semibold gap-2">
              <Link to="/shop" search={{ view: "orders" }}><ArrowLeft className="size-4" /> Back to my orders</Link>
            </Button>
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
    <main className="min-h-screen overflow-y-auto order-chat-gutter">
      {/* Members get a way back to their order screen; link-only customers
          (manual orders) arrived by link, so there is nothing to go back to. */}
      {user && (
        <div className="w-full px-3 pt-3">
          <Link
            to="/shop"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Back to my orders
          </Link>
        </div>
      )}
      <CheckoutTemplate
        view={view}
        claimToken={token}
        onPaymentSent={async () => { await sendPaymentSent({ data: { token, password: pw } }); await load(pw); }}
        onSwitchPayMethod={async (method) => {
          await switchPayMethod({ data: { token, password: pw, method } });
          await load(pw);
        }}
        onContinueToSetup={async () => {
          const result = await continueToAccountSetup({ data: { token, password: pw } });
          if (!result.ok) {
            toast.error("The order could not be moved to account setup");
            return false;
          }
          await load(pw);
          toast.success("Your order is now in account setup");
          return true;
        }}
        moveToSetup={canMoveToSetup && view.order.id && view.order.paidAt && !view.order.cancelled && !view.order.accountSetupStartedAt && !view.order.accountSetupAt && !view.order.completedAt ? (
          <button
            type="button"
            disabled={movingToSetup}
            onClick={async () => {
              setMovingToSetup(true);
              try {
                await startAccountSetup({ data: { orderId: view.order.id as string } });
                await load(pw);
                toast.success("Order moved to account setup");
              } catch (cause) {
                toast.error(cause instanceof Error ? cause.message : "The order could not be moved");
              } finally {
                setMovingToSetup(false);
              }
            }}
            className="w-full h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {movingToSetup ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />} Move to account setup
          </button>
        ) : undefined}
        addLoginDetails={canManage && view.order.id && view.order.paidAt && view.order.accountSetupStartedAt && !view.order.accountSetupAt && !view.order.cancelled ? (
          <button type="button" onClick={() => setLoginOpen(true)} className="w-full h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold inline-flex items-center justify-center gap-2">
            <KeyRound className="size-4" /> {view.order.customerKind === "existing" ? "Enter renewal expiry date" : "Add customer login details"}
          </button>
        ) : undefined}
        cardPayment={(view.order.method === "square" || view.order.method === "stripe" || view.order.method === "crypto") && !view.order.paidAt && !view.order.cancelled ? (
          <CheckoutCardPayment token={token} password={pw} method={view.order.method} amountCents={view.order.totalCents} onPaid={() => { load(pw); }} />
        ) : undefined}
        payByBank={["square", "stripe", "wise"].includes(view.order.method) && !view.order.paidAt && !view.order.cancelled ? (
          <PayByBankSection token={token} password={pw} hideCardNote={view.order.method === "wise"} />
        ) : undefined}
        appLogin={view.order.accountSetupAt && !view.order.cancelled ? <OrderAppLogin token={token} password={pw} /> : undefined}
        videoHelp={(!canManage || isVideoTestOrder(token)) && !view.order.cancelled ? <OrderVideoCallCustomer token={token} password={pw} mobile={isMobilePhone()} inline /> : undefined}
      />
      {canManage && view.order.id && (
        <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{view.order.customerKind === "existing" ? "Renewal subscription expiry" : "Customer service login details"}</DialogTitle>
              <DialogDescription>{view.order.customerKind === "existing" ? "Updates the customer's account in admin Credentials and their profile, and tells them the new expiry in this sale's chat." : "Saved to the customer's account and sent to them in this sale's chat with the subscription length, dates and QD code."}</DialogDescription>
            </DialogHeader>
            <SecureLinkPanel orderId={view.order.id} loginOnly onDone={() => { load(pw); }} />
          </DialogContent>
        </Dialog>
      )}
      <CustomerCheckoutChat token={token} password={pw} orderRef={view.order.ref} />
    </main>
  );
}

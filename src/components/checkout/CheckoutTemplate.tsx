import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Check, Copy, CreditCard, Info, Lock, Mail, PartyPopper, UserPlus } from "lucide-react";
import hero from "@/assets/checkout-family-tv.jpg";

export type CheckoutView = {
  order: {
    ref: string;
    name: string;
    totalCents: number;
    discountCents: number;
    paidAt: string | null;
    completedAt: string | null;
    cancelled?: boolean;
    method: string;
    customerKind: "new" | "existing";
  };
  items: { name: string; qty: number; unitCents: number }[];
  invoice: { status: string; url: string | null; number: string | null } | null;
  bank: { account_name: string | null; sort_code: string | null; account_number: string | null; iban: string | null; bic: string | null } | null;
};

const GBP = (c: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(c / 100);
const METHOD: Record<string, string> = { stripe: "Stripe", square: "Square", wise: "bank transfer", cash: "cash" };

export function OrderStatusBar({ step, compact = false }: { step: number; compact?: boolean }) {
  const labels = ["Created", "Awaiting payment", "Paid", "Completed"];
  return (
    <div className="flex items-start w-full" aria-label={`Order status: ${labels[step]}`}>
      {labels.map((l, i) => {
        const done = i < step || step === 3;
        const current = i === step;
        return (
          <div key={l} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <div className={`absolute top-[11px] right-1/2 w-full h-0.5 ${i <= step ? "bg-success" : "bg-border"}`} />}
            <div className={`relative z-10 grid place-items-center rounded-full border-2 ${compact ? "size-5" : "size-6"} ${done ? "bg-success border-success text-background" : current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
              {done ? <Check className="size-3" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </div>
            {!compact && <span className={`mt-1.5 text-[11px] text-center ${current ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{l}</span>}
          </div>
        );
      })}
    </div>
  );
}

export function checkoutStep(o: { paidAt: string | null; completedAt: string | null; method: string | null }) {
  if (o.completedAt) return 3;
  if (o.paidAt || o.method === "cash") return 2;
  return 1;
}

function CopyRow({ label, value }: { label: string; value: string | null }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-t border-border first:border-t-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm ml-auto break-all text-right">{value}</span>
      <button type="button" onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function CheckoutTemplate({ view, preview = false, claimToken }: { view: CheckoutView; preview?: boolean; claimToken?: string }) {
  const { order, items, invoice, bank } = view;
  const step = checkoutStep(order);
  const subtotal = items.reduce((s, i) => s + i.unitCents * i.qty, 0);
  const paid = step >= 2;
  const method = order.method;
  // Bank transfer (Wise) puts the details + reference warning in a right sidebar
  // on wide screens; everything else stays in the single centered column.
  const bankSidebar = method === "wise" && !paid && !order.cancelled;

  let heading = `Order ${order.ref}`;
  let sub = "Please complete your payment below.";
  if (order.cancelled) { heading = "This order has been cancelled"; sub = "Contact us using the chat if you think this is a mistake."; }
  else if (step === 3) {
    heading = order.customerKind === "existing" ? "Your subscription has been upgraded!" : "Your account has been set up!";
    sub = order.customerKind === "existing" ? "Your upgrade is live now — just restart your app to enjoy it." : "Your new account is ready. Your login details will be sent to you by the team.";
  } else if (method === "cash") { heading = "Thank you for your cash payment!"; sub = "We'll set everything up and let you know when it's complete."; }
  else if (paid) { heading = "Thank you — we've got your payment!"; sub = "We'll set everything up and let you know when it's complete."; }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className={`${bankSidebar ? "max-w-4xl" : "max-w-2xl"} mx-auto pb-24`}>
        <img src={hero} alt="A family relaxing on the sofa watching TV together" width={1600} height={640} className="w-full h-44 sm:h-60 object-cover sm:rounded-b-2xl" />
        <div className="px-5 -mt-2 pb-6 space-y-6">
          <div className="text-center pt-6 space-y-2">
            {(paid || order.cancelled) && (
              <div className={`mx-auto size-14 rounded-full grid place-items-center ${order.cancelled ? "bg-destructive/15 text-destructive" : "bg-success text-background"}`}>
                {step === 3 ? <PartyPopper className="size-7" /> : order.cancelled ? <AlertTriangle className="size-7" /> : <Check className="size-8" />}
              </div>
            )}
            <h1 className="font-display text-2xl sm:text-3xl font-bold">{heading}</h1>
            <p className="text-sm text-muted-foreground">
              {paid || order.cancelled ? `Order ${order.ref} · ` : ""}{order.name ? `For ${order.name} · ` : ""}{paid ? `Paid by ${METHOD[method] ?? method}` : sub}
            </p>
          </div>

          {!order.cancelled && <OrderStatusBar step={step} />}

          <div className={bankSidebar ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start" : "space-y-6"}>
            <section className={`rounded-2xl border border-border bg-card p-5 ${bankSidebar ? "min-w-0" : ""}`}>
            <h2 className="font-semibold mb-3">Order breakdown</h2>
            <div className="space-y-2 text-sm">
              {items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3"><span>{i.qty} × {i.name}</span><span>{GBP(i.unitCents * i.qty)}</span></div>
              ))}
              {order.discountCents > 0 && (
                <>
                  <div className="flex justify-between text-muted-foreground border-t border-border pt-2"><span>Subtotal</span><span>{GBP(subtotal)}</span></div>
                  <div className="flex justify-between text-success"><span>Discount</span><span>−{GBP(order.discountCents)}</span></div>
                </>
              )}
              <div className="flex justify-between font-bold text-base border-t border-border pt-3"><span>{paid ? "Total paid" : "Total to pay"}</span><span>{GBP(order.totalCents)}</span></div>
            </div>
          </section>

          {(paid || order.cancelled) ? (
            !order.cancelled && (
              <section className="space-y-3">
                <div className="rounded-2xl border border-border bg-card p-5 flex gap-3">
                  {step === 3 ? <Info className="size-5 text-primary shrink-0" /> : <Mail className="size-5 text-primary shrink-0" />}
                  <p className="text-sm">{step === 3 ? sub : "We'll set everything up and let you know when it's complete. Use the chat button if you have any questions."}</p>
                </div>
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 flex gap-3 items-start">
                  <UserPlus className="size-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-2 min-w-0">
                    <p className="font-semibold">Keep updated with the service</p>
                    <p className="text-sm text-muted-foreground">
                      {order.customerKind === "existing"
                        ? "Sign in to your account to follow your order, get the latest updates and have your subscription re-applied straight away."
                        : "Create a free account to follow your order, get the latest updates and manage your subscription any time. Your subscription is added automatically — no waiting for approval."}
                    </p>
                    <Link
                      to={order.customerKind === "existing" ? "/login" : "/signup"}
                      onClick={() => { if (claimToken) try { localStorage.setItem("bm-checkout-claim", claimToken); } catch { /* ignore */ } }}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
                    >
                      {order.customerKind === "existing" ? "Sign in to my account" : "Create an account"}
                    </Link>
                  </div>
                </div>
              </section>
            )
          ) : (method === "stripe" || method === "square") ? (
            <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Pay by card with {METHOD[method]}</h2>
                  <p className="text-xs text-muted-foreground">Secure invoice{invoice?.number ? ` ${invoice.number}` : ""} — card details are handled by {METHOD[method]}.</p>
                </div>
              </div>
              {invoice?.url || preview ? (
                <a href={invoice?.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90">
                  <Lock className="size-4" /> Pay invoice {GBP(order.totalCents)}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Your invoice is being prepared. Please refresh shortly or message us in the chat.</p>
              )}
              <p className="text-xs text-center text-muted-foreground">After paying, come back to this page — it updates automatically.</p>
            </section>
          ) : method === "wise" ? (
            <aside className="min-w-0 space-y-6">
              <section className="rounded-2xl border border-border bg-card p-5">
                <h2 className="font-semibold">Bank transfer details</h2>
                <p className="text-xs text-muted-foreground mb-3">Send exactly {GBP(order.totalCents)} to this account.</p>
                {bank ? (
                  <div className="rounded-xl border border-border px-3">
                    <CopyRow label="Account name" value={bank.account_name} />
                    <CopyRow label="Sort code" value={bank.sort_code} />
                    <CopyRow label="Account number" value={bank.account_number} />
                    <CopyRow label="IBAN" value={bank.iban} />
                    <CopyRow label="BIC" value={bank.bic} />
                    <CopyRow label="Reference" value={order.ref} />
                  </div>
                ) : <p className="text-sm text-muted-foreground">Bank details are not available right now — please message us in the chat.</p>}
              </section>
              <section className="rounded-2xl border-2 border-warning bg-warning/10 p-5 flex gap-3 min-w-0">
                <AlertTriangle className="size-6 text-warning shrink-0" />
                <div className="space-y-1 min-w-0">
                  <p className="font-bold text-warning break-words">IMPORTANT: You MUST use <span className="font-mono">{order.ref}</span> as your payment reference.</p>
                  <p className="text-sm">Do not add anything else to the reference. Payments without this exact reference cannot be matched to your order and will be delayed.</p>
                </div>
              </section>
            </aside>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

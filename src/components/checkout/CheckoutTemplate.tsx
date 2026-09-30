import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Bitcoin, BookOpen, Check, ChevronLeft, ChevronRight, Clock, Copy, CreditCard, Hourglass, Loader2, Lock, PartyPopper, Send, UserCheck, UserPlus } from "lucide-react";
import hero from "@/assets/checkout-family-tv.jpg";
import installGuideIllustration from "@/assets/manual-order-install-guide.jpg";
import { Button } from "@/components/ui/button";

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
    manual?: boolean;
    createdAt?: string;
    email?: string | null;
    customerType?: string | null;
    existingUsername?: string | null;
    discountCode?: string | null;
    adultContent?: boolean | null;
    status?: string;
    paymentSentAt?: string | null;
    id?: string;
    accountSetupStartedAt?: string | null;
    accountSetupAt?: string | null;
  };
  items: { name: string; qty: number; unitCents: number }[];
  invoice: { status: string; url: string | null; number: string | null } | null;
  bank: { account_name: string | null; sort_code: string | null; account_number: string | null; iban: string | null; bic: string | null } | null;
  qdCode?: { label: string; code: string } | null;
};

const GBP = (c: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(c / 100);
const METHOD: Record<string, string> = { stripe: "Stripe", square: "Square", wise: "bank transfer", cash: "cash", crypto: "crypto (USDT)" };

export function OrderStatusBar({ step, compact = false, awaitingConfirmation = false, accountSetup = false, renewal = false, selectedStep, onStepSelect }: { step: number; compact?: boolean; awaitingConfirmation?: boolean; accountSetup?: boolean; renewal?: boolean; selectedStep?: number; onStepSelect?: (step: number) => void }) {
  const labels = ["Created", awaitingConfirmation ? "Awaiting confirmation" : "Awaiting payment", "Paid", renewal ? "Subscription extended" : "Account set up", "Completed"];
  // Map the 4-state step (0-3) onto 5 labels: after paid, "Account set up" is done once confirmed.
  step = step === 3 ? 4 : step === 2 && accountSetup ? 3 : step;
  const shownStep = selectedStep ?? step;
  return (
    <div className="flex items-start w-full" aria-label={`Order status: ${labels[step]}. Viewing ${labels[shownStep]}`}>
      {labels.map((l, i) => {
        const done = i < step || step === 4;
        const current = i === step;
        const selected = i === shownStep;
        const available = i <= step;
        return (
          <div key={l} className="flex-1 flex flex-col items-center relative">
            {i > 0 && <div className={`absolute top-[11px] right-1/2 w-full h-0.5 ${i <= step ? "bg-success" : "bg-border"}`} />}
            <button type="button" disabled={!onStepSelect || !available} onClick={() => onStepSelect?.(i)} aria-label={`${l}${current ? ", current stage" : ""}${selected ? ", selected" : ""}`} className={`relative z-10 grid place-items-center rounded-full border-2 disabled:cursor-default ${compact ? "size-5" : "size-6"} ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""} ${done ? "bg-success border-success text-background" : current ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>
              {done ? <Check className="size-3" /> : <span className="text-[10px] font-bold">{i + 1}</span>}
            </button>
            {!compact && <span className={`mt-1.5 text-[11px] text-center ${selected ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{l}</span>}
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


export function CheckoutTemplate({ view, preview = false, claimToken, cardPayment, onPaymentSent, onContinueToSetup, moveToSetup, addLoginDetails, completeSale }: { view: CheckoutView; preview?: boolean; claimToken?: string; cardPayment?: ReactNode; onPaymentSent?: () => Promise<void>; onContinueToSetup?: () => Promise<void>; moveToSetup?: ReactNode; addLoginDetails?: ReactNode; completeSale?: ReactNode }) {
  const [sending, setSending] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const { order, items, invoice, bank } = view;
  const step = checkoutStep(order);
  const subtotal = items.reduce((s, i) => s + i.unitCents * i.qty, 0);
  const paid = step >= 2;
  const method = order.method;
  const awaitingConfirmation = !paid && !order.cancelled && !!order.paymentSentAt;
  const accountSetupStarted = !!order.accountSetupStartedAt || !!order.accountSetupAt || step === 3;
  const accountSetup = !!order.accountSetupAt;
  const latestStage = step === 3 ? 4 : step === 2 && accountSetupStarted ? 3 : step;
  const [visibleStage, setVisibleStage] = useState(latestStage);
  useEffect(() => setVisibleStage(latestStage), [latestStage]);
  // Payment details (bank info, card form, crypto) sit in a right sidebar on
  // wide screens while the order is awaiting payment.
  const paymentSidebar = ["wise", "stripe", "square", "crypto"].includes(method) && !paid && !order.cancelled && visibleStage === 1;
  const accountSidebar = paid && !order.cancelled && visibleStage >= 3;
  const paidSidebar = paid && !order.cancelled && visibleStage === 2;
  const splitLayout = paymentSidebar || accountSidebar || paidSidebar;
  const installCard = paid && claimToken ? (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="grid grid-cols-[112px_minmax(0,1fr)] items-stretch">
        <img src={installGuideIllustration} alt="Person on a sofa watching television" loading="lazy" width={992} height={672} className="size-full min-h-36 object-cover" />
        <div className="min-w-0 p-4 space-y-3">
          <div><p className="font-semibold">Install the app while we set up your account</p><p className="mt-1 text-sm text-muted-foreground">Use your paid order to open the private install guides now.</p></div>
          {order.manual
            ? <Link to="/checkout-install/$token" params={{ token: claimToken }} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"><BookOpen className="size-4" /> Open install guides</Link>
            : <Link to="/install-guides" search={{ tab: "guides", checkout: claimToken }} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"><BookOpen className="size-4" /> Open install guides</Link>}
        </div>
      </div>
    </section>
  ) : null;

  let heading = `Order #${order.ref}`;
  let sub = "Please complete your payment below.";
  if (order.cancelled) { heading = "This order has been cancelled"; sub = "Contact us using the chat if you think this is a mistake."; }
  else if (visibleStage === 0) { heading = `Order #${order.ref} created`; sub = "Your secure order was created successfully."; }
  else if (visibleStage === 1 && paid) { heading = "Payment stage"; sub = "This payment step has been completed."; }
  else if (visibleStage === 4) {
    heading = order.customerKind === "existing" ? "Your subscription has been extended!" : "Your account has been set up!";
    sub = order.customerKind === "existing" ? "Your extension is live now — just restart your app to carry on watching." : "Your new account is ready. Your login details will be sent to you by the team.";
  } else if (visibleStage === 3) { heading = order.customerKind === "existing" ? "Subscription extension" : "Account setup"; sub = accountSetup ? "This step is complete and the sale is ready to finish." : "Payment is confirmed and setup is in progress."; }
  else if (visibleStage === 2) { heading = "Thank you — we've got your payment!"; sub = "Your payment has been confirmed."; }
  else if (method === "cash") { heading = "Thank you for your cash payment!"; sub = "We'll set everything up and let you know when it's complete."; }
  else if (awaitingConfirmation) { heading = "Payment sent — awaiting confirmation"; sub = "Thanks! We're waiting for your payment to arrive. This page updates automatically once it's confirmed."; }
  else if (paid) { heading = "Thank you — we've got your payment!"; sub = "We'll set everything up and let you know when it's complete."; }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="w-full px-3 pb-24">
        <img src={hero} alt="A family relaxing on the sofa watching TV together" width={1600} height={640} className="w-full h-auto max-h-[420px] object-contain bg-card rounded-b-2xl" />
        <div className="px-2 sm:px-4 -mt-2 pb-6 space-y-6">
          <div className="text-center pt-6 space-y-2">
            {(paid || order.cancelled) && (
              <div className={`mx-auto size-14 rounded-full grid place-items-center ${order.cancelled ? "bg-destructive/15 text-destructive" : "bg-success text-background"}`}>
                {step === 3 ? <PartyPopper className="size-7" /> : order.cancelled ? <AlertTriangle className="size-7" /> : <Check className="size-8" />}
              </div>
            )}
            <h1 className="font-display text-2xl sm:text-3xl font-bold">{heading}</h1>
            <p className="text-sm text-muted-foreground">
              {paid || order.cancelled ? `Order #${order.ref} · ` : ""}{order.name ? `For ${order.name} · ` : ""}{paid ? `Paid by ${METHOD[method] ?? method}` : sub}
            </p>
          </div>

          {!order.cancelled && (
            <div className="space-y-3">
              <OrderStatusBar step={step} awaitingConfirmation={awaitingConfirmation} accountSetup={accountSetupStarted} renewal={order.customerKind === "existing"} selectedStep={visibleStage} onStepSelect={setVisibleStage} />
              <div className="flex items-center justify-between gap-3">
                <Button type="button" variant="outline" size="sm" disabled={visibleStage === 0} onClick={() => setVisibleStage((stage) => Math.max(0, stage - 1))}><ChevronLeft className="size-4" /> Previous step</Button>
                <span className="text-xs text-muted-foreground">Viewing step {visibleStage + 1} of {latestStage + 1}</span>
                <Button type="button" variant="outline" size="sm" disabled={visibleStage >= latestStage} onClick={() => setVisibleStage((stage) => Math.min(latestStage, stage + 1))}>Next step <ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}

          {awaitingConfirmation && (
            <div className="rounded-2xl border-2 border-warning bg-warning/10 p-4 flex gap-3 items-start">
              <Hourglass className="size-5 text-warning shrink-0 mt-0.5 animate-pulse" />
              <div className="text-sm space-y-1">
                <p className="font-semibold">We're waiting to confirm your payment</p>
                <p className="text-muted-foreground">{method === "wise" ? "Bank transfers can take anywhere from a few minutes up to 1–2 working days to arrive, depending on your bank. You don't need to do anything else — we'll confirm it as soon as it lands." : "Your payment is being confirmed. This usually only takes a few minutes."}</p>
              </div>
            </div>
          )}

          <div className={splitLayout ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,440px)] lg:items-start" : "space-y-6"}>
            <section className={`rounded-2xl border border-border bg-card p-5 ${splitLayout ? "min-w-0" : ""}`}>
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
            <h2 className="font-semibold mt-6 mb-3">Order details</h2>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {([
                ["Order", `#${order.ref}`],
                ["Placed", order.createdAt ? new Date(order.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : null],
                ["Name", order.name || null],
                ["Email", order.email],
                ["Customer", order.customerType === "existing" ? "Existing customer" : order.customerType === "new" ? "New customer" : null],
                ["Username", order.existingUsername],
                ["Payment", METHOD[method] ?? (method || null)],
                ["Discount code", order.discountCode],
                ["Adult content", order.adultContent == null ? null : order.adultContent ? "Yes" : "No"],
                ["Status", order.status ? order.status.charAt(0).toUpperCase() + order.status.slice(1) : null],
              ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="break-all text-right font-medium">{v}</dd></div>
              ))}
            </dl>
          </section>

          {paidSidebar ? (
            <aside className="min-w-0 space-y-3 lg:sticky lg:top-4">
              <section className="rounded-2xl border border-success/40 bg-success/10 p-5 space-y-4">
                <div className="flex gap-3 items-start">
                  <Check className="size-5 text-success shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Square payment received</p>
                    <p className="text-sm text-muted-foreground">Your payment is confirmed. Continue when you’re ready so we can begin setting up your service.</p>
                  </div>
                </div>
                {onContinueToSetup && (
                  <button
                    type="button"
                    disabled={continuing}
                    onClick={async () => {
                      setContinuing(true);
                      try { await onContinueToSetup(); } finally { setContinuing(false); }
                    }}
                    className="w-full h-11 px-5 rounded-xl bg-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {continuing ? <Loader2 className="size-4 animate-spin" /> : <UserCheck className="size-4" />}
                    Continue to account setup
                  </button>
                )}
              </section>
              {installCard}
              {moveToSetup}
            </aside>
          ) : accountSidebar ? (
            <aside className="min-w-0 space-y-3 lg:sticky lg:top-4">
              <section className={`rounded-2xl border p-5 flex gap-3 items-start ${accountSetup ? "border-success/40 bg-success/10" : "border-border bg-card"}`}>
                {accountSetup ? <UserCheck className="size-5 text-success shrink-0 mt-0.5" /> : <Clock className="size-5 text-primary shrink-0 mt-0.5" />}
                <div className="space-y-1">
                  <p className="font-semibold">{order.customerKind === "existing" ? "Subscription extension" : "Account setup"}</p>
                  <p className="text-sm">{step === 3
                    ? sub
                    : accountSetup
                      ? (order.customerKind === "existing" ? "Your subscription has been extended — we're just finishing off your order." : "Your account has been set up. Your login details have been sent in the chat.")
                      : (order.customerKind === "existing" ? "Payment confirmed. We're now extending your subscription." : "Payment confirmed. We're now setting up your account.")}</p>
                </div>
              </section>
              {installCard}
              {addLoginDetails}
              {visibleStage === 3 && completeSale}
              {visibleStage === 4 && order.manual && (
                <section className="rounded-2xl border border-primary/30 bg-primary/5 p-5 flex gap-3 items-start">
                  <UserPlus className="size-5 text-primary shrink-0 mt-0.5" />
                  <div className="space-y-2 min-w-0">
                    <p className="font-semibold">Keep updated with the service</p>
                    <p className="text-sm text-muted-foreground">Create a free account to follow your orders, get the latest updates and manage your subscription any time. Your subscription is added automatically — no waiting for approval.</p>
                    <Link
                      to="/signup"
                      onClick={() => { if (claimToken) try { localStorage.setItem("bm-checkout-claim", claimToken); } catch { /* ignore */ } }}
                      className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90"
                    >
                      Create an account
                    </Link>
                  </div>
                </section>
              )}
            </aside>
          ) : paymentSidebar && (method === "stripe" || method === "square") ? (
            <aside className="min-w-0 rounded-2xl border border-border bg-card p-5 space-y-4 lg:sticky lg:top-4">
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Pay by card with {METHOD[method]}</h2>
                  <p className="text-xs text-muted-foreground">Enter your card below — card details are handled securely by {METHOD[method]}.</p>
                </div>
              </div>
              {cardPayment ? cardPayment : preview ? (
                <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">
                  <Lock className="size-4" /> Pay {GBP(order.totalCents)}
                </div>
              ) : invoice?.url ? (
                <a href={invoice.url} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold hover:opacity-90">
                  <Lock className="size-4" /> Pay invoice {GBP(order.totalCents)}
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">Loading secure card form…</p>
              )}
              <p className="text-xs text-center text-muted-foreground">This page updates automatically once your payment goes through.</p>
            </aside>
          ) : paymentSidebar && method === "crypto" ? (
            <aside className="min-w-0 rounded-2xl border border-border bg-card p-5 space-y-4 lg:sticky lg:top-4">
              <div className="flex items-center gap-3">
                <Bitcoin className="size-5 text-primary" />
                <div>
                  <h2 className="font-semibold">Pay with crypto (USDT)</h2>
                  <p className="text-xs text-muted-foreground">Payments are handled securely by NOWPayments.</p>
                </div>
              </div>
              {cardPayment ? cardPayment : (
                <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-semibold">
                  <Lock className="size-4" /> Pay {GBP(order.totalCents)} in USDT
                </div>
              )}
              <p className="text-xs text-center text-muted-foreground">Crypto payments can take a few minutes to confirm. This page updates automatically.</p>
            </aside>
          ) : paymentSidebar && method === "wise" ? (
            <aside className="min-w-0 space-y-6 lg:sticky lg:top-4">
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
              <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex gap-3 items-start">
                  <Clock className="size-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm"><span className="font-semibold">Please allow time for your transfer to arrive.</span> Most bank transfers land within minutes, but some banks can take up to 1–2 working days (longer over weekends and bank holidays). Your order will move on as soon as we receive it.</p>
                </div>
                {awaitingConfirmation ? (
                  <div className="flex items-center justify-center gap-2 h-11 rounded-xl bg-warning/15 text-warning text-sm font-semibold"><Hourglass className="size-4" /> Payment sent — awaiting confirmation</div>
                ) : (
                  <button type="button" disabled={preview || sending || !onPaymentSent} onClick={async () => { if (!onPaymentSent) return; setSending(true); try { await onPaymentSent(); } finally { setSending(false); } }} className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60">
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} I've sent the payment
                  </button>
                )}
              </section>
            </aside>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

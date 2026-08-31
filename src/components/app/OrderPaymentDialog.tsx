import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, CreditCard, Receipt, ShoppingBag, UserCog, X } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useCurrency } from "@/hooks/use-currency";
import {
  createSquareInvoiceForOrder,
  refreshSquareInvoiceStatus,
} from "@/lib/square-invoices.functions";
import {
  createCryptoInvoice,
  getCryptoConfig,
  getCryptoInvoiceStatus,
} from "@/lib/nowpayments.functions";
import { StripeOrderPanel, verifyStripePaymentForOrder } from "@/components/app/StripeOrderPanel";
import { confirmStripePayment } from "@/lib/stripe-payments.functions";
import { BankTransferPanel } from "@/components/app/BankTransferPanel";
import { getMyBankTransferAccess } from "@/lib/bank-transfer.functions";


const fallbackFormat = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((cents || 0) / 100);

export function OrderProgressStrip({
  order,
  bankTransfer = false,
  transferReported = false,
}: {
  order: { status: string; paid_at?: string | null; completed_at?: string | null };
  bankTransfer?: boolean;
  transferReported?: boolean;
}) {
  const placed = true;
  const paid = !!order.paid_at;
  const setup = order.status === "completed" || !!order.completed_at;
  const cancelled = order.status === "cancelled";

  const payTitle = cancelled
    ? "Cancelled"
    : bankTransfer && !paid
      ? transferReported
        ? "Bank Transfer In Progress"
        : "Awaiting Bank Transfer"
      : "Pay For Order";

  const steps = [
    {
      n: 1,
      title: "Place Order",
      icon: ShoppingBag,
      done: placed && !cancelled,
      active: !cancelled && !paid,
      cancelled: false,
    },
    {
      n: 2,
      title: payTitle,
      icon: cancelled ? X : Receipt,
      done: paid && !cancelled,
      active: !cancelled && placed && !paid,
      cancelled,
    },
    {
      n: 3,
      title: "Account Setup",
      icon: UserCog,
      done: setup && !cancelled,
      active: !cancelled && paid && !setup,
      cancelled,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = cancelled ? 0 : Math.round((completed / steps.length) * 100);

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-blue-600 shadow-[0_6px_24px_-6px_rgba(124,58,237,0.5)]">
      <div className="rounded-[11px] bg-surface/95 backdrop-blur p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-sky-400 bg-clip-text text-transparent">
            Order Progress
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {cancelled ? "Cancelled" : `${completed}/${steps.length} · ${pct}%`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-700 rounded-full",
              cancelled
                ? "bg-destructive"
                : "bg-gradient-to-r from-violet-600 via-fuchsia-500 to-sky-500 shadow-[0_0_10px_rgba(217,70,239,0.6)]",
            )}
            style={{ width: `${cancelled ? 100 : pct}%` }}
          />
        </div>
        <ol className="relative space-y-2">
          {steps.map((s, idx) => (
            <li key={s.n} className="relative">
              {idx < steps.length - 1 && (
                <span
                  className={cn(
                    "absolute left-[18px] top-9 bottom-[-8px] w-0.5 rounded",
                    s.done && !s.cancelled
                      ? "bg-gradient-to-b from-emerald-400 to-emerald-500/30"
                      : "bg-border",
                  )}
                />
              )}
              <div
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all",
                  s.cancelled
                    ? "border-destructive/50 bg-destructive/10"
                    : s.done
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : s.active
                        ? "border-fuchsia-400/60 bg-gradient-to-r from-violet-600/15 via-fuchsia-500/15 to-sky-500/15 ring-1 ring-fuchsia-400/40 shadow-[0_0_18px_-4px_rgba(217,70,239,0.55)]"
                        : "border-border bg-surface-2/50 opacity-70",
                )}
              >
                <span
                  className={cn(
                    "size-9 rounded-lg grid place-items-center shrink-0 shadow-inner",
                    s.cancelled
                      ? "bg-destructive/25 text-destructive"
                      : s.done
                        ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                        : s.active
                          ? "bg-gradient-to-br from-violet-600 via-fuchsia-500 to-sky-500 text-white animate-pulse"
                          : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {s.done && !s.cancelled ? <Check className="size-4" /> : <s.icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none font-semibold">
                    Step {s.n}
                  </div>
                  <div className="text-[12px] font-bold truncate flex items-center gap-1.5 mt-0.5">
                    {s.title}
                    {s.active && !s.cancelled && <span className="size-1.5 rounded-full bg-fuchsia-400 animate-pulse" />}
                  </div>
                </div>
                {s.done && !s.cancelled && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">
                    Done
                  </span>
                )}
                {s.active && !s.cancelled && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-fuchsia-300 shrink-0">
                    Now
                  </span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function PayOrderDialog({
  orderId,
  amountCents,
  onChange,
}: {
  orderId: string;
  amountCents: number;
  onChange?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [bankOnly, setBankOnly] = useState<boolean | null>(null);
  const { format = fallbackFormat } = useCurrency();
  const checkBankAccess = useServerFn(getMyBankTransferAccess);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res: any = await checkBankAccess({});
        if (!cancelled) setBankOnly(Boolean(res?.allowed));
      } catch {
        if (!cancelled) setBankOnly(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = async () => {
    await onChange?.();
  };

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-auto px-4 py-2.5 rounded-lg font-medium"
      >
        <CreditCard className="size-4" />
        Pay {format(amountCents)}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{bankOnly ? "Pay by bank transfer" : "Choose how to pay"}</DialogTitle>
            <div className="text-sm text-muted-foreground">Total {format(amountCents)}</div>
          </DialogHeader>
          {bankOnly === null ? (
            <div className="text-xs text-muted-foreground py-3">Loading payment options…</div>
          ) : bankOnly ? (
            <div className="pt-2">
              <BankTransferPanel orderId={orderId} amountCents={amountCents} onChange={handleChange} />
            </div>
          ) : (
            <Tabs defaultValue="square" className="pt-2">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="square">Square</TabsTrigger>
                <TabsTrigger value="stripe">Stripe</TabsTrigger>
                <TabsTrigger value="usdt">USDT</TabsTrigger>
              </TabsList>
              <TabsContent value="square" className="mt-3">
                <SquareInvoicePanel orderId={orderId} amountCents={amountCents} onChange={handleChange} />
              </TabsContent>
              <TabsContent value="stripe" className="mt-3">
                <StripeOrderPanel
                  orderId={orderId}
                  amountCents={amountCents}
                  canPay
                  onChange={handleChange}
                />
              </TabsContent>
              <TabsContent value="usdt" className="mt-3">
                <CryptoPanel orderId={orderId} amountCents={amountCents} canPay onChange={handleChange} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


function SquareInvoicePanel({
  orderId,
  amountCents,
  onChange,
}: {
  orderId: string;
  amountCents: number;
  onChange?: () => void | Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { format = fallbackFormat } = useCurrency();
  const createInvoice = useServerFn(createSquareInvoiceForOrder);
  const refreshInvoice = useServerFn(refreshSquareInvoiceStatus);
  const confirmStripeFn = useServerFn(confirmStripePayment);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("order_invoices")
        .select("public_url,status")
        .eq("order_id", orderId)
        .maybeSingle();
      if (cancelled) return;
      if (data?.public_url) setUrl(data.public_url);
      if (data?.status) setStatus(data.status);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res: any = await createInvoice({ data: { orderId } });
      if (res?.public_url) {
        setUrl(res.public_url);
        setStatus(res.status ?? "UNPAID");
        try {
          window.open(res.public_url, "_blank", "noopener,noreferrer");
        } catch {}
        await onChange?.();
      } else {
        setErr("Invoice created but no link was returned. Please refresh.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    setBusy(true);
    setErr(null);
    try {
      const stripeRes: any = await verifyStripePaymentForOrder(confirmStripeFn, orderId);
      if (stripeRes && !("error" in stripeRes)) {
        setStatus("PAID");
        await onChange?.();
        return;
      }
      const res: any = await refreshInvoice({ data: { orderId } });
      if (res?.status) setStatus(res.status);
      if (res?.public_url) setUrl(res.public_url);
      await onChange?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to refresh status");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="text-xs text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground leading-relaxed">
        Pay securely via a hosted Square invoice. Card, Apple Pay, and Google Pay are supported on
        the invoice page. Total {format(amountCents)}.
      </div>
      {url ? (
        <div className="space-y-2">
          <Button asChild className="w-full h-auto px-4 py-2.5 rounded-lg font-medium">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <CreditCard className="size-4" />
              Open Square invoice
            </a>
          </Button>
          {status && <div className="text-[11px] text-muted-foreground text-center">Status: {status}</div>}
          <Button type="button" variant="link" onClick={refresh} disabled={busy} className="w-full h-auto text-xs">
            {busy ? "Checking…" : "I've paid — refresh status"}
          </Button>
          <Button type="button" variant="link" onClick={generate} disabled={busy} className="w-full h-auto text-[11px] text-muted-foreground">
            {busy ? "Generating…" : "Generate a fresh link"}
          </Button>
        </div>
      ) : (
        <Button type="button" onClick={generate} disabled={busy} className="w-full h-auto px-4 py-2.5 rounded-lg font-medium">
          <CreditCard className="size-4" />
          {busy ? "Creating invoice…" : `Pay ${format(amountCents)} via Square`}
        </Button>
      )}
      {err && <div className="text-xs text-destructive">{err}</div>}
    </div>
  );
}

function UsdtLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="USDT">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <circle cx="12" cy="12" r="12" className="fill-success" />
        <path
          d="M13.3 10.9V9.5h3.2V7.4H7.5v2.1h3.2v1.4c-2.6.1-4.6.6-4.6 1.2 0 .6 2 1.1 4.6 1.2v4.5h2.6v-4.5c2.6-.1 4.6-.6 4.6-1.2 0-.6-2-1.1-4.6-1.2zm0 2v0c-.1 0-.7.1-1.9.1-1 0-1.7-.1-1.9-.1v0c-2.2-.1-3.8-.5-3.8-.9 0-.5 1.6-.8 3.8-.9v1.5c.2 0 .9.1 1.9.1 1.2 0 1.8-.1 1.9-.1v-1.5c2.2.1 3.8.4 3.8.9 0 .4-1.6.8-3.8.9z"
          className="fill-primary-foreground"
        />
      </svg>
      <span className="text-xs font-semibold tracking-tight">USDT</span>
    </span>
  );
}

function CryptoPanel({
  orderId,
  amountCents,
  canPay,
  onChange,
}: {
  orderId: string;
  amountCents: number;
  canPay: boolean;
  onChange?: () => void | Promise<void>;
}) {
  const [paid, setPaid] = useState<any | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [network] = useState<string>("ERC20");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [invoice, setInvoice] = useState<{ url: string; id: string } | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [bootError, setBootError] = useState<string | null>(null);
  const { format = fallbackFormat } = useCurrency();
  const getCfg = useServerFn(getCryptoConfig);
  const createInvoice = useServerFn(createCryptoInvoice);
  const checkStatus = useServerFn(getCryptoInvoiceStatus);

  const loadPayment = async () => {
    const { data } = await supabase
      .from("order_payments")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    setPaid(data);
  };

  useEffect(() => {
    loadPayment();
  }, [orderId]);

  useEffect(() => {
    const ch = supabase
      .channel(`opcrypto-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => loadPayment(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getCfg();
        if (cancelled) return;
        setEnabled(cfg.enabled);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open || !invoice) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await checkStatus({ data: { orderId } });
        if (stopped) return;
        if (res.paid) {
          toast.success(`Paid ${format(amountCents)} via USDT`);
          setOpen(false);
          setInvoice(null);
          await loadPayment();
          await onChange?.();
        }
      } catch {
        /* ignore */
      }
    };
    const handle = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(handle);
    };
  }, [open, invoice, orderId, amountCents]);

  const startPayment = async () => {
    setLoading(true);
    setBootError(null);
    try {
      const res = await createInvoice({ data: { orderId, network: network as any } });
      setInvoice({ url: res.invoiceUrl, id: res.invoiceId });
      setExpiresAt(res.expiresAt ? new Date(res.expiresAt).getTime() : Date.now() + 24 * 60 * 60 * 1000);
      setOpen(true);
      try {
        window.open(res.invoiceUrl, "_blank", "noopener,noreferrer");
      } catch {}
    } catch (e) {
      setBootError(e instanceof Error ? e.message : "Failed to create invoice");
      toast.error(e instanceof Error ? e.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !expiresAt) return;
    setNow(Date.now());
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [open, expiresAt]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const fmtCountdown = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  if (paid?.provider === "nowpayments") {
    return (
      <div>
        <UsdtLogo className="mb-1.5" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pay with USDT</div>
        <div className="rounded-md bg-success/10 border border-success/20 px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-2 text-success text-xs font-medium">
            <CreditCard className="size-3.5" /> {paid.status === "finished" ? "Paid" : `Status: ${paid.status}`}
            {paid.card_brand && <span className="font-mono text-muted-foreground">{paid.card_brand}</span>}
            {paid.last_4 && <span className="font-mono text-muted-foreground">tx …{paid.last_4}</span>}
          </div>
          {paid.status !== "finished" && paid.receipt_url && canPay && (
            <a href={paid.receipt_url} target="_blank" rel="noopener noreferrer" className="block text-center text-[11px] underline text-success hover:text-success/80">
              Open existing invoice
            </a>
          )}
        </div>
      </div>
    );
  }

  // Only hide when a payment actually completed — an abandoned/pending attempt
  // on another provider (e.g. Stripe) must not remove the USDT checkout button.
  if (paid && (paid.status === "COMPLETED" || paid.status === "finished")) return null;
  if (enabled === false) return null;
  if (!canPay) return null;

  return (
    <div>
      <UsdtLogo className="mb-1.5" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pay with USDT</div>
      <div className="text-[11px] text-muted-foreground mb-2">Network: USDT ERC20 (Ethereum)</div>
      {bootError && <div className="text-xs text-destructive mb-2">{bootError}</div>}
      <Button type="button" onClick={startPayment} disabled={loading || enabled === null} className="w-full h-auto px-2.5 py-2 rounded-md text-xs font-medium">
        <UsdtLogo />
        {loading ? "Creating invoice…" : `Pay ${format(amountCents)} with USDT`}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setInvoice(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UsdtLogo /> USDT Payment ({network})
            </DialogTitle>
          </DialogHeader>
          {invoice ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Invoice expires in</span>
                <span className={cn("font-mono text-sm font-semibold tabular-nums", remainingMs < 60 * 60 * 1000 ? "text-destructive" : "text-foreground")}>
                  {remainingMs > 0 ? fmtCountdown(remainingMs) : "Expired"}
                </span>
              </div>
              <p className="text-sm text-foreground">
                Your USDT (ERC20) checkout has opened in a new tab. If it didn't, use the button below.
              </p>
              <Button asChild className="w-full h-auto px-3 py-2 rounded-md text-sm font-medium">
                <a href={invoice.url} target="_blank" rel="noopener noreferrer">
                  <UsdtLogo /> Open USDT checkout
                </a>
              </Button>
              <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
                Waiting for on-chain confirmation. This window will close automatically once payment is detected. You can safely leave this page open.
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Loading invoice…</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
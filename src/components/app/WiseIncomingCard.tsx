import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  Landmark,
  Link as LinkIcon,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { confirmBankTransferReceived } from "@/lib/bank-transfer.functions";
import { allocateWisePayment, dismissGmailConfirmation, getWiseIncomingTransfers, revealWiseForwardUrl, type WiseFeed } from "@/lib/wise.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((cents || 0) / 100);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const REFRESH_MS = 60_000;

export function WiseIncomingCard({
  mode = "feed",
  hidePending = false,
}: { mode?: "feed" | "settings"; hidePending?: boolean } = {}) {
  const loadFeed = useServerFn(getWiseIncomingTransfers);
  const confirm = useServerFn(confirmBankTransferReceived);

  const [feed, setFeed] = useState<WiseFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const reveal = useServerFn(revealWiseForwardUrl);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [keyCode, setKeyCode] = useState("");
  const [revealing, setRevealing] = useState(false);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const dismissConfirmation = useServerFn(dismissGmailConfirmation);
  const allocate = useServerFn(allocateWisePayment);
  const [allocating, setAllocating] = useState<{
    paymentId: string;
    amountCents: number;
    sender: string | null;
    order: { orderId: string; reference: string; customerName: string | null; amountCents: number };
  } | null>(null);
  const [allocBusy, setAllocBusy] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const doDismissConfirmation = async () => {
    setDismissing(true);
    try {
      await dismissConfirmation({});
      setFeed((prev) => (prev ? { ...prev, gmailConfirmation: null } : prev));
      toast.success("Confirmation hidden — forwarding is live.");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not hide it");
    } finally {
      setDismissing(false);
    }
  };

  const doReveal = async () => {
    if (!/^\d{6}$/.test(keyCode)) { toast.error("Enter the 6-digit code"); return; }
    setRevealing(true);
    try {
      const { data: f } = await supabase.auth.mfa.listFactors();
      const factor = f?.totp?.find((x: any) => x.status === "verified");
      if (!factor) throw new Error("Set up 2FA on your account first");
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: keyCode });
      if (error) throw new Error("Wrong 2FA code");
      const res = await reveal({});
      setRevealedUrl(res.forwardUrl);
      setKeyCode("");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not unlock");
    } finally {
      setRevealing(false);
    }
  };

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res: any = await loadFeed({});
      setFeed(res as WiseFeed);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load Wise feed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadFeed]);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doAllocate = async () => {
    if (!allocating) return;
    setAllocBusy(true);
    try {
      await allocate({ data: { paymentId: allocating.paymentId, orderId: allocating.order.orderId } });
      toast.success("Payment allocated to the order.");
      setAllocating(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not allocate payment");
    } finally {
      setAllocBusy(false);
    }
  };

  const doConfirm = async (orderId: string) => {
    setBusyOrder(orderId);
    try {
      await confirm({ data: { orderId } });
      setConfirmed((prev) => new Set(prev).add(orderId));
      toast.success("Payment confirmed — order marked paid and customer notified.");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not confirm payment");
    } finally {
      setBusyOrder(null);
    }
  };

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-surface-1 p-5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading Wise feed…
        </div>
      </section>
    );
  }

  if (feed && !feed.configured) {
    return (
      <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-2">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-sky-500/15 text-sky-400 grid place-items-center">
            <Landmark className="size-5" />
          </div>
          <div>
            <h2 className="font-display font-bold">
              {mode === "settings" ? "Wise settings" : "Incoming transfers (Wise)"}
            </h2>
            <p className="text-xs text-muted-foreground">Not connected yet.</p>
          </div>
        </div>
        {mode === "settings" ? (
          <p className="text-xs text-muted-foreground leading-relaxed">
            The Wise key and email forwarding address live here once a token is saved.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground leading-relaxed">
          To see bank transfers land here automatically, create a read token in your Wise account (Settings → API
          tokens, full access) and ask Lovable to save it as <span className="font-mono">WISE_API_TOKEN</span>. Nothing
          in this app can move money — it only reads what arrived.
        </p>
      </section>
    );
  }

  const transactions = feed?.transactions ?? [];
  const pending = feed?.pending ?? [];
  const pendingConfirmed = (orderId: string) => confirmed.has(orderId);
  const tDate = (t: { date: string | null }) => new Date(t.date ?? 0);
  const tYear = (t: { date: string | null }) => tDate(t).getFullYear();
  const tMonth = (t: { date: string | null }) => tDate(t).getMonth();
  const years = Array.from(new Set(transactions.map(tYear))).sort((a, b) => b - a);
  const selYear = year !== null && years.includes(year) ? year : years[0];
  const yearTx = transactions.filter((t) => tYear(t) === selYear);
  const months = Array.from(new Set(yearTx.map(tMonth))).sort((a, b) => b - a);
  const selMonth = month !== null && months.includes(month) ? month : months[0];
  const shown = yearTx.filter((t) => tMonth(t) === selMonth);

  if (mode === "settings") {
    return (
      <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-sky-500/15 text-sky-400 grid place-items-center">
            <Landmark className="size-5" />
          </div>
          <div>
            <h2 className="font-display font-bold">Wise settings</h2>
            <p className="text-xs text-muted-foreground">
              Admin only. The Wise key and email forwarding address are locked behind 2FA.
            </p>
          </div>
        </div>

        {feed?.authError ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlert className="size-4 shrink-0 mt-0.5" />
            <span>
              Wise rejected the saved token. Create a new token in Wise (Settings → API tokens) and ask Lovable to
              replace it. {feed.error ? `(${feed.error})` : null}
            </span>
          </div>
        ) : null}

        {feed?.forwardUrl ? (
          <details className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs">
            <summary className="cursor-pointer font-medium">Wise key / forwarding address (admin, 2FA locked)</summary>
            {revealedUrl ? (
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono">{revealedUrl}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(revealedUrl); toast.success("Copied"); }}>Copy</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setRevealedUrl(null)}>Hide</Button>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground">Enter your 6-digit 2FA code to view:</span>
                <input
                  value={keyCode}
                  onChange={(e) => setKeyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === "Enter") void doReveal(); }}
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="w-28 rounded border border-border bg-background px-2 py-1 font-mono"
                  aria-label="2FA code for Wise key"
                />
                <Button type="button" size="sm" disabled={revealing} onClick={() => void doReveal()}>
                  {revealing ? <Loader2 className="size-3.5 animate-spin" /> : null} Unlock
                </Button>
              </div>
            )}
          </details>
        ) : (
          <p className="text-xs text-muted-foreground">
            No Wise key is saved yet. Save one as <span className="font-mono">WISE_API_TOKEN</span> to enable the feed.
          </p>
        )}

        {feed?.gmailConfirmation ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="font-bold text-amber-300">Gmail forwarding confirmation</div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-auto px-2 py-1 text-xs text-amber-300"
                disabled={dismissing}
                onClick={() => void doDismissConfirmation()}
              >
                {dismissing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Forwarding confirmed — hide this
              </Button>
            </div>
            {feed.gmailConfirmation.code ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span>Enter this code in Gmail:</span>
                <code className="rounded bg-background px-3 py-1.5 font-mono text-base font-bold">
                  {feed.gmailConfirmation.code}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(feed.gmailConfirmation?.code ?? ""); toast.success("Code copied"); }}>
                  Copy code
                </Button>
              </div>
            ) : null}
            {feed.gmailConfirmation.url ? (
              <a
                href={feed.gmailConfirmation.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 font-semibold text-amber-300 underline"
              >
                Confirm forwarding with Google <ArrowUpRight className="size-4" />
              </a>
            ) : null}
            {!feed.gmailConfirmation.code && !feed.gmailConfirmation.url ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Gmail’s confirmation arrived, but its code was not included. Resend it from Gmail and refresh this page.
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground leading-relaxed">
          Incoming payments come from forwarded Wise payment emails — see the “Incoming transfers” tab for the list.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface-1 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-sky-500/15 text-sky-400 grid place-items-center">
            <Wallet className="size-5" />
          </div>
          <div>
            <h2 className="font-display font-bold">Incoming transfers (Wise)</h2>
            <p className="text-xs text-muted-foreground">
              From Wise payment emails · by year and month · refreshes every minute
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => void load()}
          aria-label="Refresh Wise feed"
          className="shrink-0"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {feed?.error ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {feed.error}
        </div>
      ) : null}

      {transactions.length === 0 && !feed?.error ? (
        <p className="text-xs text-muted-foreground">No incoming payments yet.</p>
      ) : null}

      {years.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Year">
            {years.map((y) => (
              <button key={y} type="button" role="tab" aria-selected={y === selYear}
                onClick={() => { setYear(y); setMonth(null); }}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${y === selYear ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}>
                {y} <span className="opacity-70">({transactions.filter((t) => tYear(t) === y).length})</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Month">
            {months.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={m === selMonth}
                onClick={() => setMonth(m)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${m === selMonth ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground"}`}>
                {MONTHS[m]} <span className="opacity-70">({yearTx.filter((t) => tMonth(t) === m).length})</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-2">
        {shown.map((t) => {
          const settled = t.match ? pendingConfirmed(t.match.orderId) : false;
          return (
            <li
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{fmt(t.amountCents)}</span>
                  {t.match?.exact ? (
                    <span className="rounded-full bg-emerald-500/15 text-emerald-400 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
                      Match
                    </span>
                  ) : t.match ? (
                    <span className="rounded-full bg-amber-500/15 text-amber-400 text-[10px] font-bold px-2 py-0.5 uppercase tracking-wide">
                      Possible match
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {t.senderName ?? "Unknown sender"}
                  {t.date ? ` · ${new Date(t.date).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}` : ""}
                </div>
                {(t.reference || t.description) && (
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {[t.reference, t.description].filter(Boolean).join(" · ")}
                  </div>
                )}
              </div>

              {t.match ? (
                <div className="flex items-center gap-2">
                  <Link
                    to="/shop"
                    search={{ view: "orders", scope: "all", id: t.match.orderId } as never}
                    className="text-[11px] text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <LinkIcon className="size-3" />
                    View order · {t.match.customerName ?? "Customer"} · {fmt(t.match.amountCents)}
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyOrder !== null || settled}
                    onClick={() => t.match && void doConfirm(t.match.orderId)}
                    className="h-auto px-3 py-1.5 text-xs rounded-lg"
                  >
                    {busyOrder === t.match.orderId ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : settled ? (
                      <Check className="size-3.5" />
                    ) : (
                      <ArrowUpRight className="size-3.5" />
                    )}
                    {settled ? "Confirmed" : "Confirm received"}
                  </Button>
                </div>
              ) : (
                <select
                  aria-label="Allocate to order"
                  value=""
                  disabled={pending.length === 0}
                  onChange={(e) => {
                    const p = pending.find((x) => x.orderId === e.target.value);
                    if (p) setAllocating({ paymentId: t.id, amountCents: t.amountCents, sender: t.senderName, order: p });
                  }}
                  className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs max-w-[260px]"
                >
                  <option value="">{pending.length ? "Select the order this pays…" : "No orders awaiting payment"}</option>
                  {pending.map((p) => (
                    <option key={p.orderId} value={p.orderId}>
                      {p.customerName ?? "Customer"} · {p.reference} · {fmt(p.amountCents)}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={!!allocating} onOpenChange={(o) => { if (!o && !allocBusy) setAllocating(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Is this the right order?</AlertDialogTitle>
            <AlertDialogDescription>
              {allocating ? (
                <>
                  Allocate the {fmt(allocating.amountCents)} payment from {allocating.sender ?? "Unknown sender"} to{" "}
                  {allocating.order.customerName ?? "Customer"}'s order {allocating.order.reference} ({fmt(allocating.order.amountCents)})?
                  {Math.abs(allocating.amountCents - allocating.order.amountCents) > 1 ? " The amounts do not match." : ""}
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={allocBusy}>No, cancel</AlertDialogCancel>
            <AlertDialogAction disabled={allocBusy} onClick={(e) => { e.preventDefault(); void doAllocate(); }}>
              {allocBusy ? <Loader2 className="size-3.5 animate-spin" /> : null} Yes, this is the right order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!hidePending && pending.length > 0 ? (
        <div className="rounded-xl border border-border bg-surface-2/60 p-3 space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            Waiting for payment
          </div>
          <ul className="space-y-1">
            {pending.map((p) => (
              <li key={p.orderId} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate">
                  {p.customerName ?? "Customer"} · <span className="font-mono">{p.reference}</span>
                </span>
                <span className="font-semibold shrink-0">{fmt(p.amountCents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

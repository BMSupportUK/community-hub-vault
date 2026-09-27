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
import { getWiseIncomingTransfers, type WiseFeed } from "@/lib/wise.functions";

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((cents || 0) / 100);

const REFRESH_MS = 60_000;

export function WiseIncomingCard() {
  const loadFeed = useServerFn(getWiseIncomingTransfers);
  const confirm = useServerFn(confirmBankTransferReceived);

  const [feed, setFeed] = useState<WiseFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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
            <h2 className="font-display font-bold">Incoming transfers (Wise)</h2>
            <p className="text-xs text-muted-foreground">Not connected yet.</p>
          </div>
        </div>
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
              From Wise payment emails · last 14 days · refreshes every minute
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

      {feed?.forwardUrl ? (
        <details className="rounded-lg border border-border bg-surface-2/50 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium">Email forwarding address (keep private)</summary>
          <p className="mt-2 text-muted-foreground">Wise "you received money" emails sent here appear in this feed.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-background px-2 py-1 font-mono">{feed.forwardUrl}</code>
            <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(feed.forwardUrl!); toast.success("Copied"); }}>Copy</Button>
          </div>
        </details>
      ) : null}

      {feed?.gmailConfirmation ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <div className="font-bold text-amber-300">Gmail forwarding confirmation</div>
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

      {feed?.authError ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <CircleAlert className="size-4 shrink-0 mt-0.5" />
          <span>
            Wise rejected the saved token. Create a new token in Wise (Settings → API tokens) and ask Lovable to
            replace it. {feed.error ? `(${feed.error})` : null}
          </span>
        </div>
      ) : feed?.error ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {feed.error}
        </div>
      ) : null}

      {transactions.length === 0 && !feed?.error ? (
        <p className="text-xs text-muted-foreground">No incoming payments in the last 14 days.</p>
      ) : null}

      <ul className="space-y-2">
        {transactions.map((t) => {
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
                    search={{ view: "orders", id: t.match.orderId } as never}
                    className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                  >
                    <LinkIcon className="size-3" />
                    {t.match.customerName ?? "Order"} · {fmt(t.match.amountCents)}
                  </Link>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyOrder !== null || settled || !t.match.exact}
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
              ) : null}
            </li>
          );
        })}
      </ul>

      {pending.length > 0 ? (
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

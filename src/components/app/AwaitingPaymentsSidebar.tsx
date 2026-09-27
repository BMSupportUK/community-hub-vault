import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Clock, Loader2, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
import { cancelBankTransferOrder, confirmBankTransferReceived } from "@/lib/bank-transfer.functions";
import { getWiseIncomingTransfers, type WiseFeed } from "@/lib/wise.functions";

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((cents || 0) / 100);

type Pending = WiseFeed["pending"][number];

/** Right sidebar: orders awaiting a bank transfer, with approve / cancel. */
export function AwaitingPaymentsSidebar() {
  const loadFeed = useServerFn(getWiseIncomingTransfers);
  const confirm = useServerFn(confirmBankTransferReceived);
  const cancel = useServerFn(cancelBankTransferOrder);

  const [pending, setPending] = useState<Pending[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<{ kind: "approve" | "cancel"; item: Pending } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = (await loadFeed({})) as WiseFeed;
      setPending(res?.pending ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not load awaiting payments");
    } finally {
      setLoading(false);
    }
  }, [loadFeed]);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const run = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === "approve") {
        await confirm({ data: { orderId: action.item.orderId } });
        toast.success("Payment received — order marked paid and customer notified.");
      } else {
        await cancel({ data: { orderId: action.item.orderId } });
        toast.success("Order cancelled.");
      }
      setAction(null);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      aria-label="Awaiting payment"
      className="rounded-2xl border border-border bg-surface-1 p-4 space-y-3 lg:sticky lg:top-4 self-start"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-amber-400" />
          <h2 className="font-display font-bold text-sm">Awaiting payment ({pending.length})</h2>
        </div>
        <Button type="button" size="icon" variant="ghost" onClick={() => void load()} aria-label="Refresh">
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : pending.length === 0 ? (
        <p className="text-xs text-muted-foreground">No orders waiting for payment.</p>
      ) : (
        <ul className="space-y-2">
          {pending.map((p) => (
            <li key={p.orderId} className="rounded-xl border border-border bg-surface-2 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{p.customerName ?? "Customer"}</span>
                <span className="text-sm font-semibold shrink-0">{fmt(p.amountCents)}</span>
              </div>
              <div className="text-[11px] font-mono text-muted-foreground">{p.reference}</div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => setAction({ kind: "approve", item: p })}
                  aria-label="Approve payment"
                >
                  <Check className="size-4" /> Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  disabled={busy}
                  onClick={() => setAction({ kind: "cancel", item: p })}
                  aria-label="Cancel order"
                >
                  <X className="size-4" /> Cancel
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog open={!!action} onOpenChange={(o) => !o && !busy && setAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action?.kind === "approve" ? "Confirm payment received?" : "Cancel this order?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action
                ? action.kind === "approve"
                  ? `Confirm you have received ${fmt(action.item.amountCents)} from ${action.item.customerName ?? "this customer"} (ref ${action.item.reference}). The order will be marked paid and the customer notified.`
                  : `Cancel ${action.item.customerName ?? "this customer"}'s order for ${fmt(action.item.amountCents)} (ref ${action.item.reference})? It will be removed from awaiting payment.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Go back</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void run();
              }}
              className={action?.kind === "cancel" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {action?.kind === "approve" ? "Yes, payment received" : "Yes, cancel order"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, Check, Copy, Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getBankDetailsForOrder,
  reportBankTransferSent,
  type BankDetails,
} from "@/lib/bank-transfer.functions";

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((cents || 0) / 100);

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-sm font-mono font-semibold truncate">{value}</div>
      </div>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="shrink-0"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            toast.error("Couldn't copy");
          }
        }}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

export function BankTransferPanel({
  orderId,
  amountCents,
  onChange,
}: {
  orderId: string;
  amountCents: number;
  onChange?: () => void | Promise<void>;
}) {
  const loadDetails = useServerFn(getBankDetailsForOrder);
  const reportSent = useServerFn(reportBankTransferSent);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<BankDetails | null>(null);
  const [reference, setReference] = useState<string>("");
  const [reported, setReported] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const res: any = await loadDetails({ data: { orderId } });
      setDetails(res.details ?? null);
      setReference(res.reference ?? "");
      setReported(Boolean(res.reported));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load bank details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const confirmSent = async () => {
    setBusy(true);
    try {
      await reportSent({ data: { orderId } });
      setReported(true);
      setOpen(false);
      toast.success("Thanks — we'll check the bank account and confirm your payment shortly.");
      await onChange?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record your transfer");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="text-xs text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground leading-relaxed">
        Your account is approved to pay by bank transfer. Send {fmt(amountCents)} using the details below and quote
        your payment reference so we can match it to this order.
      </div>

      <Button type="button" onClick={() => setOpen(true)} className="w-full h-auto px-4 py-2.5 rounded-lg font-medium">
        <Landmark className="size-4" />
        Show Bank Details
      </Button>

      {reported ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300 font-medium">
          Transfer reported — awaiting verification by our team.
        </div>
      ) : null}

      {err && <div className="text-xs text-destructive">{err}</div>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="size-4" /> Bank transfer details
            </DialogTitle>
            <div className="text-sm text-muted-foreground">Amount to send {fmt(amountCents)}</div>
          </DialogHeader>

          {details && (details.account_name || details.account_number) ? (
            <div className="space-y-2">
              {details.account_name && <CopyRow label="Account name" value={details.account_name} />}
              {details.sort_code && <CopyRow label="Sort code" value={details.sort_code} />}
              {details.account_number && <CopyRow label="Account number" value={details.account_number} />}
              {details.iban && <CopyRow label="IBAN" value={details.iban} />}
              {details.bic && <CopyRow label="BIC / SWIFT" value={details.bic} />}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Bank details haven't been set up yet — please open a ticket and we'll send them to you.
            </div>
          )}

          <div className="mt-3 rounded-xl p-[1px] bg-gradient-to-br from-emerald-500 via-teal-400 to-sky-500">
            <div className="rounded-[11px] bg-surface/95 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.14em] font-bold text-emerald-300">
                Your payment reference
              </div>
              <CopyRow label="Reference" value={reference} />
              <div className="text-[11px] text-muted-foreground">
                You must quote this reference on the transfer — it's how we match your payment to this order.
              </div>
            </div>
          </div>

          {details?.instructions ? (
            <div className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {details.instructions}
            </div>
          ) : null}

          <Button
            type="button"
            onClick={confirmSent}
            disabled={busy || reported}
            className="w-full h-auto px-4 py-2.5 rounded-lg font-medium mt-1"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Banknote className="size-4" />}
            {reported ? "Transfer already reported" : "I've transferred the money"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

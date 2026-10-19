import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Landmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getPayByBankSetup, setPayByBankProvider } from "@/lib/gocardless.functions";

/** Admin/management switch for which company runs Pay by bank. */
export function PayByBankProviderCard() {
  const load = useServerFn(getPayByBankSetup);
  const save = useServerFn(setPayByBankProvider);
  const [s, setS] = useState<{ saved: string; goCardlessEnv: string | null; webhookReady: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { load().then(setS).catch(() => setS(null)); }, [load]);
  if (!s) return null;
  const gcReady = !!s.goCardlessEnv && s.webhookReady;
  const choose = async (provider: "stripe" | "gocardless") => {
    setBusy(true);
    try { await save({ data: { provider } }); setS({ ...s, saved: provider }); toast.success(`Pay by bank now uses ${provider === "stripe" ? "Stripe" : "GoCardless"}`); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2"><Landmark className="size-5 text-primary" /><h2 className="font-semibold">Pay by bank provider</h2>{busy && <Loader2 className="size-4 animate-spin" />}</div>
      <div className="flex gap-2">
        {(["stripe", "gocardless"] as const).map((p) => (
          <button key={p} type="button" disabled={busy || (p === "gocardless" && !gcReady)} onClick={() => choose(p)}
            className={`h-9 px-4 rounded-lg text-sm border disabled:opacity-50 ${s.saved === p ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground"}`}>
            {p === "stripe" ? "Stripe" : "GoCardless"}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {gcReady ? `GoCardless is set up (${s.goCardlessEnv === "live" ? "live" : "test"} mode).` : "GoCardless is waiting for its keys and webhook secret, so it stays greyed out."}
      </p>
    </section>
  );
}

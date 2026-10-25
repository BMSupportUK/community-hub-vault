import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { REMOTE_SETUP_STEPS, stepDone, type AppChecks, type SetupDevice } from "@/lib/ticket-remote-setup";

type Row = { device: SetupDevice; app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null } | null;

/** Staff view of a customer's order Remote setup — read-only, ticks come from the apps. */
export function OrderRemoteSetupStatus({ orderId }: { orderId: string }) {
  const [row, setRow] = useState<Row | undefined>(undefined);
  const load = useCallback(async () => {
    const { data } = await supabase.from("order_remote_setup").select("device,app_checks,app_checked_at,completed_at").eq("order_id", orderId).maybeSingle();
    setRow((data as Row) ?? null);
  }, [orderId]);
  useEffect(() => { void load(); const t = window.setInterval(load, 5000); return () => window.clearInterval(t); }, [load]);
  if (row === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  return <section className="max-w-2xl space-y-3 rounded-2xl border border-border bg-card/85 p-5 text-foreground backdrop-blur-sm">
    <h2 className="text-xl font-semibold">Remote access setup</h2>
    {!row ? <p className="text-sm text-muted-foreground">The customer hasn't chosen their device yet.</p> : <>
      <p className="text-sm">Device: <strong>{row.device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"}</strong> · {row.completed_at ? <span className="font-semibold text-primary">Confirmed by the apps</span> : row.app_checked_at ? "App reported — waiting on the rest" : "Waiting for the app to report"}</p>
      <ol className="space-y-2">{REMOTE_SETUP_STEPS[row.device].map((s, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">{stepDone(s, row) ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}{s.title}</li>
      ))}</ol>
      <p className="text-xs text-muted-foreground">Ticks come only from BM TV Enabler checking the TV and BM Remote Helper's live code — the customer can't tick them.</p>
    </>}
  </section>;
}

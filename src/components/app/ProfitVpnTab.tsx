import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Loader2, Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { allocateOrderAmounts, type ProfitOrder } from "@/lib/profit-calculation";
import { VPN_ADDON_PREFIX, VPN_DEFAULT_COST_PENCE_MONTH, vpnCostPence, vpnLineDays } from "@/lib/vpn-addon";
import { orderCustomerName } from "@/lib/order-customer-name";

type Order = ProfitOrder & { id: string; created_at: string; customer_type: string | null; shipping_name: string | null; existing_username: string | null; user_id?: string | null };
const money = (c: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(c / 100);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SETTING = "vpn_cost_pence_month";

/** Profit › VPN: every VPN sale (BM Player purchases and older shop add-ons) with its own fee and VPNresellers cost. */
export function ProfitVpnTab({ orders, userNames }: { orders: Order[]; userNames: Record<string, string> }) {
  const [cost, setCost] = useState<number>(VPN_DEFAULT_COST_PENCE_MONTH);
  const [draft, setDraft] = useState((VPN_DEFAULT_COST_PENCE_MONTH / 100).toFixed(2));
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  useEffect(() => {
    void supabase.from("app_settings").select("value").eq("key", SETTING).maybeSingle().then(({ data }) => {
      const p = Number((data?.value as { pence?: number } | null)?.pence);
      if (Number.isFinite(p) && p >= 0) { setCost(p); setDraft((p / 100).toFixed(2)); }
    });
  }, []);

  const sales = useMemo(() => orders.flatMap((o) => {
    const a = allocateOrderAmounts(o);
    return o.order_items.flatMap((it, i) => it.product_name.startsWith(VPN_ADDON_PREFIX) ? [{
      id: `${o.id}:${i}`, at: new Date(o.created_at), name: orderCustomerName(o as never, userNames),
      app: o.customer_type === "vpn", days: vpnLineDays(it.product_name, it.quantity),
      revenue: a.revenue[i] ?? 0, fees: a.fees[i] ?? 0, feesMissing: a.feesMissing,
    }] : []);
  }).map((s) => ({ ...s, cost: vpnCostPence(s.days, cost) })), [orders, userNames, cost]);

  const years = [...new Set(sales.map((s) => s.at.getFullYear()))].sort((a, b) => b - a);
  const ay = year && years.includes(year) ? year : years[0] ?? null;
  const inYear = sales.filter((s) => s.at.getFullYear() === ay);
  const months = [...new Set(inYear.map((s) => s.at.getMonth()))].sort((a, b) => b - a);
  const am = month != null && months.includes(month) ? month : months[0] ?? null;
  const shown = inYear.filter((s) => s.at.getMonth() === am).sort((a, b) => b.at.getTime() - a.at.getTime());
  const total = (xs: typeof sales) => xs.reduce((t, s) => ({ revenue: t.revenue + s.revenue, fees: t.fees + s.fees, cost: t.cost + s.cost, missing: t.missing || s.feesMissing }), { revenue: 0, fees: 0, cost: 0, missing: false });
  const yT = total(inYear), mT = total(shown);
  const sel = (on: boolean) => `h-auto min-h-9 rounded-md px-3 py-2 text-sm ${on ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`;

  const save = async () => {
    const p = Math.round(parseFloat(draft) * 100);
    if (!Number.isFinite(p) || p < 0) return toast.error("Enter a valid cost");
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({ key: SETTING, value: { pence: p } } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    setCost(p); toast.success("VPN cost saved");
  };

  const Totals = ({ t, label }: { t: ReturnType<typeof total>; label: string }) => (
    <section className="rounded-xl border border-border/70 bg-card/85 p-5 shadow-soft backdrop-blur-md">
      <h3 className="mb-3 font-semibold">{label}</h3>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">VPN sales</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(t.revenue)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">VPNresellers cost</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-warning">{money(t.cost)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Provider fees</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-accent">{money(t.fees)}{t.missing ? " + unknown" : ""}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t.missing ? "Provisional profit" : "Profit"}</dt><dd className={`mt-1 text-lg font-semibold tabular-nums ${t.revenue >= t.cost + t.fees ? "text-success" : "text-destructive"}`}>{money(t.revenue - t.cost - t.fees)}</dd></div>
      </dl>
    </section>
  );

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card/85 p-4 backdrop-blur-md">
        <ShieldCheck className="size-5 text-accent" />
        <div className="min-w-0 flex-1 basis-56 text-sm"><div className="font-semibold">VPN cost per account per month</div><div className="text-xs text-muted-foreground">VPNresellers charges $1.99 per active account a month (under 1,000 accounts). Each sale's cost is worked out for the days it covers.</div></div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">£<Input aria-label="VPN cost per month" className="w-24 bg-background/70" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} /></label>
        <Button size="sm" variant="outline" disabled={saving} onClick={save}>{saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save</Button>
      </div>
      {sales.length === 0 ? <p className="rounded-lg border border-border/70 bg-card/85 p-8 text-center text-muted-foreground">No VPN sales yet.</p> : (<>
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
          <span className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-accent" />Year</span>
          <div className="flex flex-wrap gap-1">{years.map((y) => <Button variant="ghost" key={y} className={sel(y === ay)} aria-pressed={y === ay} onClick={() => { setYear(y); setMonth(null); }}>{y}</Button>)}</div>
          <span className="text-sm font-medium sm:ml-4">Month</span>
          <div className="flex flex-wrap gap-1">{months.map((k) => <Button variant="ghost" key={k} className={sel(k === am)} aria-pressed={k === am} onClick={() => setMonth(k)}>{MONTHS[k]}</Button>)}</div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {am != null && <Totals t={mT} label={`${MONTHS[am]} ${ay} · ${shown.length} sale${shown.length === 1 ? "" : "s"}`} />}
          <Totals t={yT} label={`${ay} · ${inYear.length} sale${inYear.length === 1 ? "" : "s"}`} />
        </div>
        <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/85 backdrop-blur-md">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground"><tr><th className="p-3">Customer</th><th className="p-3">Date</th><th className="p-3">Bought</th><th className="p-3 text-right">Days</th><th className="p-3 text-right">Paid</th><th className="p-3 text-right">Fee</th><th className="p-3 text-right">Cost</th><th className="p-3 text-right">Profit</th></tr></thead>
            <tbody>{shown.map((s) => (
              <tr key={s.id} className="border-t border-border/60">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 tabular-nums">{s.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</td>
                <td className="p-3 text-muted-foreground">{s.app ? "In BM Player" : "Shop order"}</td>
                <td className="p-3 text-right tabular-nums">{s.days}</td>
                <td className="p-3 text-right tabular-nums">{money(s.revenue)}</td>
                <td className="p-3 text-right tabular-nums">{s.feesMissing ? "Unknown" : money(s.fees)}</td>
                <td className="p-3 text-right tabular-nums">{money(s.cost)}</td>
                <td className={`p-3 text-right font-semibold tabular-nums ${s.revenue >= s.cost + s.fees ? "text-success" : "text-destructive"}`}>{money(s.revenue - s.cost - s.fees)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>)}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const money = (c: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(c / 100);
const PROFIT_STATUSES = ["paid", "processing", "shipped", "completed"];

type Product = { id: string; name: string; price_cents: number };
type Item = { product_id: string | null; product_name: string; unit_price_cents: number; quantity: number; unit_cost_cents: number | null };
type Order = { id: string; status: string; total_cents: number; created_at: string; shipping_name: string | null; existing_username: string | null; order_items: Item[] };

type Calc = { revenue: number; cost: number; missing: boolean };
function calc(o: Order): Calc {
  let cost = 0, missing = false;
  for (const i of o.order_items ?? []) {
    if (i.unit_cost_cents == null) missing = true;
    else cost += i.unit_cost_cents * i.quantity;
  }
  return { revenue: o.total_cents, cost, missing };
}

const METHOD_LABELS: Record<string, string> = { square: "Square", stripe: "Stripe", wise: "Wise", bank_transfer: "Bank transfer", cash: "Cash", crypto: "Crypto", manual: "Manual" };

export function ProfitCostsPanel() {
  const [tab, setTab] = useState<string>("profit");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [methodOf, setMethodOf] = useState<Record<string, string>>({});
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [p, c, o] = await Promise.all([
      supabase.from("products").select("id, name, price_cents").order("name"),
      supabase.from("product_costs").select("product_id, cost_cents"),
      supabase.from("orders").select("id, status, total_cents, created_at, shipping_name, existing_username").order("created_at", { ascending: false }).limit(5000),
    ]);
    if (p.error || c.error || o.error) { toast.error((p.error ?? c.error ?? o.error)!.message); return; }
    setProducts((p.data ?? []) as Product[]);
    const m: Record<string, string> = {};
    for (const r of c.data ?? []) m[r.product_id] = (r.cost_cents / 100).toFixed(2);
    setCosts(m);
    const ids = (o.data ?? []).map((x) => x.id as string);
    const items: (Item & { order_id: string })[] = [];
    const methods: Record<string, string> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const r = await supabase.from("order_items").select("order_id, product_id, product_name, unit_price_cents, quantity, unit_cost_cents").in("order_id", chunk);
      if (r.error) { toast.error(r.error.message); return; }
      items.push(...((r.data ?? []) as (Item & { order_id: string })[]));
      const pay = await supabase.from("order_payments").select("order_id, provider").in("order_id", chunk);
      if (!pay.error) for (const row of pay.data ?? []) if (row.order_id && row.provider && !methods[row.order_id]) methods[row.order_id] = row.provider;
    }
    setMethodOf(methods);
    setOrders(((o.data ?? []) as unknown as Order[]).map((x) => ({ ...x, order_items: items.filter((i) => i.order_id === x.id) })).filter((x) => PROFIT_STATUSES.includes(x.status?.toLowerCase())));
    setLoaded(true);
  };
  useEffect(() => { if (!loaded) void load(); }, [loaded]);

  const saveCost = async (id: string) => {
    const v = Math.round(parseFloat(costs[id] ?? "") * 100);
    if (!Number.isFinite(v) || v < 0) return toast.error("Enter a valid cost");
    setSaving(id);
    const { error } = await supabase.from("product_costs").upsert({ product_id: id, cost_cents: v, updated_at: new Date().toISOString() });
    setSaving(null);
    if (error) return toast.error(error.message);
    toast.success("Cost saved");
    void load();
  };

  const list = orders ?? [];
  const years = useMemo(() => [...new Set(list.map((o) => new Date(o.created_at).getFullYear()))].sort((a, b) => b - a), [list]);
  const ay = year && years.includes(year) ? year : years[0] ?? null;
  const yearOrders = list.filter((o) => new Date(o.created_at).getFullYear() === ay);
  const byMonth = useMemo(() => {
    const m = new Map<number, { revenue: number; cost: number; n: number; missing: boolean }>();
    for (const o of yearOrders) {
      const k = new Date(o.created_at).getMonth(); const c = calc(o);
      const e = m.get(k) ?? { revenue: 0, cost: 0, n: 0, missing: false };
      e.revenue += c.revenue; e.cost += c.cost; e.n++; e.missing ||= c.missing; m.set(k, e);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [yearOrders]);
  const am = month != null && byMonth.some(([k]) => k === month) ? month : byMonth[0]?.[0] ?? null;
  const sum = (os: Order[]) => os.reduce((a, o) => { const c = calc(o); return { revenue: a.revenue + c.revenue, cost: a.cost + c.cost }; }, { revenue: 0, cost: 0 });
  const yT = sum(yearOrders), mT = sum(am != null ? yearOrders.filter((o) => new Date(o.created_at).getMonth() === am) : []);

  const pill = (a: boolean) => `px-3 h-8 rounded-lg text-sm font-medium border transition-colors ${a ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground hover:text-foreground"}`;
  const Stat = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className="rounded-xl border border-border bg-surface-2 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-lg font-semibold ${tone ?? ""}`}>{value}</div></div>
  );
  const Totals = ({ t }: { t: { revenue: number; cost: number } }) => {
    const p = t.revenue - t.cost;
    return <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Stat label="Revenue" value={money(t.revenue)} /><Stat label="Costs" value={money(t.cost)} />
      <Stat label="Profit" value={money(p)} tone={p >= 0 ? "text-success" : "text-destructive"} />
      <Stat label="Margin" value={t.revenue ? `${Math.round((p / t.revenue) * 100)}%` : "—"} />
    </div>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={pill(tab === "profit")} onClick={() => setTab("profit")}>Profit</button>
        <button type="button" className={pill(tab === "costs")} onClick={() => setTab("costs")}>Product costs</button>
        {tab === "profit" && am != null && (
          <span className="px-3 h-8 rounded-lg text-sm font-medium inline-flex items-center bg-surface-2 border border-border text-muted-foreground">
            {yearOrders.filter((o) => new Date(o.created_at).getMonth() === am).length} orders
          </span>
        )}
      </div>
      {products === null ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        : tab === "costs" ? (
          <div className="max-w-2xl space-y-2">
            <p className="text-sm text-muted-foreground">Enter what each product costs you. Past orders without a cost get filled in; later changes only affect new orders.</p>
            {products.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border p-2">
                <div className="flex-1 min-w-0"><div className="font-medium truncate">{p.name}</div><div className="text-xs text-muted-foreground">Sells for {money(p.price_cents)}</div></div>
                <span className="text-sm text-muted-foreground">Cost £</span>
                <Input className="w-24" inputMode="decimal" value={costs[p.id] ?? ""} placeholder="0.00" onChange={(e) => setCosts((c) => ({ ...c, [p.id]: e.target.value }))} />
                <Button size="sm" variant="outline" disabled={saving === p.id} onClick={() => saveCost(p.id)}>{saving === p.id ? <Loader2 className="size-4 animate-spin" /> : "Save"}</Button>
              </div>
            ))}
          </div>
        ) : list.length === 0 ? <p className="text-sm text-muted-foreground">No paid orders yet.</p> : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">{years.map((y) => <button key={y} type="button" className={pill(y === ay)} onClick={() => { setYear(y); setMonth(null); }}>{y}</button>)}</div>
            <div><h3 className="text-sm font-semibold mb-2">{ay} total</h3><Totals t={yT} /></div>
            <div className="flex flex-wrap gap-2">{byMonth.map(([k, v]) => <button key={k} type="button" className={pill(k === am)} onClick={() => setMonth(k)}>{MONTHS[k]} · {money(v.revenue - v.cost)}{v.missing ? " ⚠" : ""}</button>)}</div>
            {am != null && <div><h3 className="text-sm font-semibold mb-2">{MONTHS[am]} {ay}</h3><Totals t={mT} /></div>}
          </div>
        )}
    </div>
  );
}

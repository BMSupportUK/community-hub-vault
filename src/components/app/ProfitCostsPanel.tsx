import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChartNoAxesCombined, ChartPie, CircleAlert, Loader2, Package, Save, TrendingUp, Wallet } from "lucide-react";
import { ProfitSummaryChart } from "@/components/app/ProfitSummaryChart";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { comparePackages } from "@/lib/package-order";

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

const METHOD_LABELS: Record<string, string> = { square: "Square", stripe: "Stripe", wise: "Wise", cash: "Cash", nowpayments: "NOWPayments", manual: "Manual" };

function paymentGroup(provider: string | undefined) {
  if (provider === "crypto" || provider === "nowpayments") return "nowpayments";
  if (provider === "bank_transfer" || provider === "wise") return "wise";
  return provider;
}

export function ProfitCostsPanel() {
  const [tab, setTab] = useState<string>("profit");
  const [products, setProducts] = useState<Product[] | null>(null);
  const [costs, setCosts] = useState<Record<string, string>>({});
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [methodOf, setMethodOf] = useState<Record<string, string>>({});
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [pkg, setPkg] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    const [p, c, o] = await Promise.all([
      supabase.from("products").select("id, name, price_cents").order("name"),
      supabase.from("product_costs").select("product_id, cost_cents"),
      supabase.from("orders").select("id, status, total_cents, created_at, shipping_name, existing_username").order("created_at", { ascending: false }).limit(5000),
    ]);
    const loadError = p.error ?? c.error ?? o.error;
    if (loadError) { toast.error(loadError.message); return; }
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
  // Live: re-load when an order or payment changes, so newly paid orders appear without a refresh.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (t) clearTimeout(t); t = setTimeout(() => void load(), 500); };
    const ch = supabase
      .channel(`profit-panel-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_change_signals" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_payments" }, bump)
      .subscribe();
    const iv = setInterval(bump, 60_000);
    return () => { if (t) clearTimeout(t); clearInterval(iv); supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const all = orders ?? [];
  const methodTabs = useMemo(() => {
    const fixed = ["square", "stripe", "wise", "cash", "nowpayments"];
    const seen = new Set<string>(fixed);
    for (const o of all) { const m = paymentGroup(methodOf[o.id]); if (m) seen.add(m); }
    return [...seen].sort((a, b) => (METHOD_LABELS[a] ?? a).localeCompare(METHOD_LABELS[b] ?? b));
  }, [all, methodOf]);
  const list = tab === "profit" || tab === "costs" || tab === "packages" ? all : all.filter((o) => paymentGroup(methodOf[o.id]) === tab);
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

  const monthOrders = am != null ? yearOrders.filter((o) => new Date(o.created_at).getMonth() === am) : [];
  const yearMissing = yearOrders.some((o) => calc(o).missing);
  const monthMissing = monthOrders.some((o) => calc(o).missing);
  const pkgStats = (os: Order[]) => {
    const m = new Map<string, { revenue: number; cost: number; missing: boolean; qty: number }>();
    for (const o of os) for (const i of o.order_items ?? []) {
      const k = i.product_id ?? `name:${i.product_name}`;
      const e = m.get(k) ?? { revenue: 0, cost: 0, missing: false, qty: 0 };
      e.revenue += i.unit_price_cents * i.quantity; e.qty += i.quantity;
      if (i.unit_cost_cents == null) e.missing = true; else e.cost += i.unit_cost_cents * i.quantity;
      m.set(k, e);
    }
    return m;
  };
  const pkgYear = pkgStats(yearOrders), pkgMonth = pkgStats(monthOrders);
  const packageCards = [
    ...(products ?? []).map((p) => ({ key: p.id, name: p.name, price: p.price_cents as number | null })),
    ...[...pkgYear.keys()].filter((k) => k.startsWith("name:")).map((k) => ({ key: k, name: k.slice(5), price: null })),
  ].sort((a, b) => comparePackages(a, b) || (pkgYear.get(b.key)?.revenue ?? 0) - (pkgYear.get(a.key)?.revenue ?? 0));
  const empty = { revenue: 0, cost: 0, missing: false, qty: 0 };
  const selection = (active: boolean) => `h-auto min-h-9 rounded-md px-3 py-2 text-sm ${active ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"}`;

  return (
    <div className="space-y-6">
      <nav aria-label="Profit views" className="flex flex-wrap items-center gap-1 border-y border-border/70 bg-card/85 p-2 backdrop-blur-md">
        <Button variant="ghost" className={selection(tab === "profit")} aria-pressed={tab === "profit"} onClick={() => setTab("profit")}><ChartNoAxesCombined className="size-4" />Total profit</Button>
        {methodTabs.map((m) => <Button variant="ghost" key={m} className={selection(tab === m)} aria-pressed={tab === m} onClick={() => setTab(m)}>{METHOD_LABELS[m] ?? m}</Button>)}
        <Button variant="ghost" className={`${selection(tab === "costs")} sm:ml-auto`} aria-pressed={tab === "costs"} onClick={() => setTab("costs")}><Package className="size-4" />Product costs</Button>
        <Button variant="ghost" className={selection(tab === "packages")} aria-pressed={tab === "packages"} onClick={() => setTab("packages")}><ChartPie className="size-4" />Packages</Button>
      </nav>
      {products === null ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        : tab === "costs" ? (
          <section className="space-y-4">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Package className="size-5 text-accent" />Product costs</h2>
            <p className="max-w-2xl text-sm text-muted-foreground">Enter what each product costs you. Past orders without a cost get filled in; later changes only affect new orders.</p>
            <div className="grid gap-3 xl:grid-cols-2">
              {products.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border/70 bg-card/90 p-4 shadow-soft backdrop-blur-md">
                  <div className="min-w-0 flex-1 basis-40"><div className="font-semibold break-words">{p.name}</div><div className="mt-1 text-xs text-muted-foreground">Sells for {money(p.price_cents)}</div></div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">Cost £<Input aria-label={`Cost for ${p.name}`} className="w-24 bg-background/70" inputMode="decimal" value={costs[p.id] ?? ""} placeholder="0.00" onChange={(e) => setCosts((c) => ({ ...c, [p.id]: e.target.value }))} /></label>
                  <Button size="sm" variant="outline" disabled={saving === p.id} onClick={() => saveCost(p.id)}>{saving === p.id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}Save</Button>
                </div>
              ))}
            </div>
          </section>
        ) : tab === "packages" && list.length > 0 ? (
          <section className="space-y-5">
            <nav aria-label="Packages" className="flex flex-wrap items-center gap-1 rounded-lg border border-border/70 bg-card/85 p-2 backdrop-blur-md">
              {packageCards.map((p) => (
                <Button variant="ghost" key={p.key} className={`${selection((pkg ?? packageCards[0]?.key) === p.key)} h-auto whitespace-normal text-left`} aria-pressed={(pkg ?? packageCards[0]?.key) === p.key} onClick={() => setPkg(p.key)}><Package className="size-4 shrink-0" />{p.name}</Button>
              ))}
            </nav>
            <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
              <span className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-accent" />Financial year</span>
              <div className="flex flex-wrap gap-1">{years.map((y) => <Button variant="ghost" key={y} className={selection(y === ay)} aria-pressed={y === ay} onClick={() => { setYear(y); setMonth(null); }}>{y}</Button>)}</div>
              <span className="flex items-center gap-2 text-sm font-medium sm:ml-4">Month</span>
              <div className="flex flex-wrap gap-1">{byMonth.map(([k]) => <Button variant="ghost" key={k} className={selection(k === am)} aria-pressed={k === am} onClick={() => setMonth(k)}>{MONTHS[k]}</Button>)}</div>
            </div>
            {packageCards.filter((p) => p.key === (pkg ?? packageCards[0]?.key)).map((p) => {
              const y = pkgYear.get(p.key) ?? empty, mo = pkgMonth.get(p.key) ?? empty;
              return (
                <article key={p.key} aria-label={`${p.name} package`} className="rounded-xl border border-border/70 bg-card/85 p-4 shadow-elegant backdrop-blur-md sm:p-5">
                  <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="flex items-center gap-2 font-display text-lg font-semibold break-words"><Package className="size-4 text-accent" />{p.name}</h3>
                    <span className="text-xs text-muted-foreground">{p.price != null ? `Sells for ${money(p.price)} · ` : ""}{y.qty} sold in {ay}</span>
                  </header>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {am != null && <ProfitSummaryChart title={`${MONTHS[am]} ${ay} · Month total`} revenue={mo.revenue} cost={mo.cost} missing={mo.missing} />}
                    <ProfitSummaryChart title={`${ay} · Year total`} revenue={y.revenue} cost={y.cost} missing={y.missing} />
                  </div>
                </article>
              );
            })}
          </section>
        ) : list.length === 0 ? <div className="flex flex-col items-center gap-3 bg-card/85 py-16 text-muted-foreground"><Wallet className="size-8 text-accent" /><p>{tab === "profit" || tab === "packages" ? "No paid orders yet." : `No ${METHOD_LABELS[tab] ?? tab} orders yet.`}</p></div> : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_640px]">
            <div className="min-w-0 space-y-6">
              <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
                <span className="flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4 text-accent" />Financial year</span>
                <div className="flex flex-wrap gap-1">{years.map((y) => <Button variant="ghost" key={y} className={selection(y === ay)} aria-pressed={y === ay} onClick={() => { setYear(y); setMonth(null); }}>{y}</Button>)}</div>
              </div>
              <section aria-label="Annual overview" className="border-b border-border/70 bg-card/85 p-5 shadow-soft backdrop-blur-md sm:p-6">
                <div className="flex items-center justify-between gap-3"><h2 className="font-display text-xl font-semibold">{ay} overview</h2><span className="text-xs text-muted-foreground">{yearOrders.length} orders</span></div>
                <div className="my-6"><p className="flex items-center gap-2 text-sm text-muted-foreground"><TrendingUp className="size-4 text-success" />{yearMissing ? "Provisional profit" : "Total profit"}</p><p className={`mt-2 break-words font-display text-4xl font-bold tabular-nums ${yT.revenue >= yT.cost ? "text-success" : "text-destructive"}`}>{money(yT.revenue - yT.cost)}</p></div>
                <dl className="grid grid-cols-2 gap-4 border-t border-border/70 pt-4"><div><dt className="text-xs text-muted-foreground">Revenue</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(yT.revenue)}</dd></div><div><dt className="text-xs text-muted-foreground">Product costs</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-warning">{money(yT.cost)}</dd></div></dl>
                {yearMissing && <p className="mt-4 flex items-center gap-2 text-xs text-warning"><CircleAlert className="size-4 shrink-0" />Some orders have missing costs.</p>}
              </section>
              <section className="space-y-4">
                <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><CalendarDays className="size-5 text-accent" />Monthly breakdown</h2>
                <div className="flex flex-wrap gap-2">{byMonth.map(([k, v]) => <Button key={k} variant="outline" className={`${selection(k === am)} flex-col items-start gap-1 border-border/70 ${k !== am ? "bg-card/90" : "border-primary"}`} aria-pressed={k === am} onClick={() => setMonth(k)}><span className="flex items-center gap-2 font-semibold">{MONTHS[k]}{v.missing && <CircleAlert className="size-3" />}</span><span className="text-xs tabular-nums">{money(v.revenue - v.cost)}</span></Button>)}</div>
                {am != null && <div className="border-y border-border/70 bg-card/90 px-5 py-5 backdrop-blur-md">
                  <div className="mb-5 flex items-center justify-between gap-2"><h3 className="font-semibold">{MONTHS[am]} {ay}</h3><span className="text-xs text-muted-foreground">{monthOrders.length} orders</span></div>
                  <dl className="grid grid-cols-2 gap-5 sm:grid-cols-3">
                    <div><dt className="text-xs text-muted-foreground">Revenue</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{money(mT.revenue)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">Costs</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-warning">{money(mT.cost)}</dd></div>
                    <div><dt className="text-xs text-muted-foreground">{monthMissing ? "Provisional profit" : "Profit"}</dt><dd className={`mt-1 text-lg font-semibold tabular-nums ${mT.revenue >= mT.cost ? "text-success" : "text-destructive"}`}>{money(mT.revenue - mT.cost)}</dd></div>
                  </dl>
                </div>}
              </section>
            </div>
            <aside aria-label="Profit statistics" className="grid min-w-0 gap-4 sm:grid-cols-2 lg:sticky lg:top-6 lg:grid-cols-1 xl:grid-cols-2">
              {am != null && <ProfitSummaryChart title={`${MONTHS[am]} ${ay} · Month total`} revenue={mT.revenue} cost={mT.cost} missing={monthMissing} />}
              <ProfitSummaryChart title={`${ay} · Year total`} revenue={yT.revenue} cost={yT.cost} missing={yearMissing} />
            </aside>
          </div>
        )}
    </div>
  );
}

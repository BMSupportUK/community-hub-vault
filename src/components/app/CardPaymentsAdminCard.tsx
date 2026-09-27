import { useEffect, useMemo, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Provider = "square" | "stripe";
type Row = {
  id: string;
  order_id: string;
  provider: string;
  status: string;
  amount_cents: number;
  currency: string;
  card_brand: string | null;
  last_4: string | null;
  receipt_url: string | null;
  created_at: string;
  order?: { status: string | null; shipping_name: string | null; email: string | null; existing_username: string | null; customer_type: string | null } | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
  } catch {
    return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
  }
}

function statusTone(s: string) {
  const v = s.toLowerCase();
  if (["completed", "paid", "succeeded", "approved"].includes(v)) return "bg-success/15 text-success border-success/30";
  if (["pending", "processing", "approved_pending"].includes(v)) return "bg-warning/15 text-warning border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

export function CardPaymentsAdminCard() {
  const [provider, setProvider] = useState<Provider>("square");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("order_payments")
        .select("id, order_id, provider, status, amount_cents, currency, card_brand, last_4, receipt_url, created_at")
        .in("provider", ["square", "stripe"])
        .order("created_at", { ascending: false })
        .limit(2000);
      if (cancelled) return;
      if (error) return setError(error.message);
      const ids = Array.from(new Set((data ?? []).map((r) => r.order_id)));
      const orders: Record<string, Row["order"]> = {};
      if (ids.length) {
        const { data: o } = await supabase
          .from("orders")
          .select("id, status, shipping_name, email, existing_username, customer_type")
          .in("id", ids);
        for (const x of o ?? []) if (x.id) orders[x.id] = x as never;
      }
      if (!cancelled) setRows((data ?? []).map((r) => ({ ...r, order: orders[r.order_id] ?? null })));
    })();
    return () => { cancelled = true; };
  }, []);

  const list = useMemo(() => (rows ?? []).filter((r) => r.provider === provider), [rows, provider]);
  const years = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of list) { const y = new Date(r.created_at).getFullYear(); m.set(y, (m.get(y) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [list]);
  const activeYear = year && years.some(([y]) => y === year) ? year : years[0]?.[0] ?? null;
  const months = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of list) { const d = new Date(r.created_at); if (d.getFullYear() === activeYear) m.set(d.getMonth(), (m.get(d.getMonth()) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [list, activeYear]);
  const activeMonth = month !== null && months.some(([mm]) => mm === month) ? month : months[0]?.[0] ?? null;
  const shown = list.filter((r) => { const d = new Date(r.created_at); return d.getFullYear() === activeYear && d.getMonth() === activeMonth; });
  const monthTotal = shown.reduce<Record<string, number>>((acc, r) => { acc[r.currency] = (acc[r.currency] ?? 0) + r.amount_cents; return acc; }, {});

  const pill = (active: boolean) => `px-3 h-8 rounded-lg text-sm font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Card payments</h2>
        <p className="text-sm text-muted-foreground">Square and Stripe orders with their payment status, by year and month.</p>
      </div>

      <div className="flex gap-2">
        {(["square", "stripe"] as const).map((p) => (
          <button key={p} type="button" className={pill(provider === p)} onClick={() => { setProvider(p); setYear(null); setMonth(null); }}>
            {p === "square" ? "Square" : "Stripe"} ({(rows ?? []).filter((r) => r.provider === p).length})
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-destructive">Could not load payments: {error}</p>
        : rows === null ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        : list.length === 0 ? <p className="text-sm text-muted-foreground">No {provider === "square" ? "Square" : "Stripe"} payments yet.</p>
        : (
          <>
            <div className="flex flex-wrap gap-2">
              {years.map(([y, n]) => <button key={y} type="button" className={pill(y === activeYear)} onClick={() => { setYear(y); setMonth(null); }}>{y} ({n})</button>)}
            </div>
            <div className="flex flex-wrap gap-2">
              {months.map(([mm, n]) => <button key={mm} type="button" className={pill(mm === activeMonth)} onClick={() => setMonth(mm)}>{MONTHS[mm]} ({n})</button>)}
            </div>
            <p className="text-sm text-muted-foreground">
              Total this month: {Object.entries(monthTotal).map(([c, v]) => money(v, c)).join(" · ")}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-muted-foreground text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Payment</th>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Card</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="px-3 py-2">
                        <div>{r.order?.shipping_name || r.order?.existing_username || "—"}</div>
                        {r.order?.email && <div className="text-xs text-muted-foreground">{r.order.email}</div>}
                        <div className="text-xs text-muted-foreground">#{r.order_id.slice(0, 8)}{r.order?.customer_type ? ` · ${r.order.customer_type}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{money(r.amount_cents, r.currency)}</td>
                      <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full border text-xs capitalize ${statusTone(r.status)}`}>{r.status.toLowerCase()}</span></td>
                      <td className="px-3 py-2 capitalize">{r.order?.status ?? "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.card_brand ? `${r.card_brand}${r.last_4 ? ` •••• ${r.last_4}` : ""}` : "—"}</td>
                      <td className="px-3 py-2">{r.receipt_url && <a href={r.receipt_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">Receipt <ExternalLink className="size-3" /></a>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  );
}

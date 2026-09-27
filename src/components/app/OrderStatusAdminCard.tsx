import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ProfitCostsDialog } from "./ProfitCostsDialog";

type Row = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  paid_at: string | null;
  completed_at: string | null;
  shipping_name: string | null;
  existing_username: string | null;
  customer_type: string | null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function money(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(cents / 100);
}

function statusTone(s: string) {
  const v = s.toLowerCase();
  if (["completed", "paid"].includes(v)) return "bg-success/15 text-success border-success/30";
  if (["pending", "processing", "shipped"].includes(v)) return "bg-warning/15 text-warning border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

function paymentLabel(provider: string | null | undefined) {
  const v = (provider ?? "").toLowerCase();
  if (v === "stripe") return "Stripe";
  if (v === "square") return "Square";
  if (v === "bank_transfer" || v === "bank") return "Bank transfer";
  return provider ? provider : "—";
}

export function OrderStatusAdminCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total_cents, created_at, paid_at, completed_at, shipping_name, existing_username, customer_type")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (cancelled) return;
      if (error) return setError(error.message);
      const orders = (data ?? []) as Row[];
      setRows(orders);
      if (orders.length) {
        const { data: pays } = await supabase
          .from("order_payments")
          .select("order_id, provider")
          .in("order_id", orders.map((o) => o.id));
        if (cancelled) return;
        const map: Record<string, string> = {};
        for (const p of (pays ?? []) as { order_id: string; provider: string | null }[]) {
          if (p.provider && !map[p.order_id]) map[p.order_id] = p.provider;
        }
        setMethods(map);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const list = rows ?? [];
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
  const monthTotal = shown.reduce((acc, r) => acc + r.total_cents, 0);

  const pill = (active: boolean) => `px-3 h-8 rounded-lg text-sm font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Order status</h2>
          <p className="text-sm text-muted-foreground">Every order with its current status, by year and month.</p>
        </div>
        <ProfitCostsDialog />
      </div>

      {error ? <p className="text-sm text-destructive">Could not load orders: {error}</p>
        : rows === null ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        : list.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p>
        : (
          <>
            <div className="flex flex-wrap gap-2">
              {years.map(([y, n]) => <button key={y} type="button" className={pill(y === activeYear)} onClick={() => { setYear(y); setMonth(null); }}>{y} ({n})</button>)}
            </div>
            <div className="flex flex-wrap gap-2">
              {months.map(([mm, n]) => <button key={mm} type="button" className={pill(mm === activeMonth)} onClick={() => setMonth(mm)}>{MONTHS[mm]} ({n})</button>)}
            </div>
            <p className="text-sm text-muted-foreground">
              {shown.length} order{shown.length === 1 ? "" : "s"} this month · Total {money(monthTotal)}
            </p>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-muted-foreground text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Paid</th>
                    <th className="px-3 py-2 font-medium">Completed</th>
                    <th className="px-3 py-2 font-medium">Payment method</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td className="px-3 py-2">
                        <div>{r.shipping_name || r.existing_username || "—"}</div>
                        <div className="text-xs text-muted-foreground">#{r.id.slice(0, 8)}{r.customer_type ? ` · ${r.customer_type}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{money(r.total_cents)}</td>
                      <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full border text-xs capitalize ${statusTone(r.status)}`}>{r.status.toLowerCase()}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{r.paid_at ? new Date(r.paid_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{r.completed_at ? new Date(r.completed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs">{paymentLabel(methods[r.id])}</td>
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

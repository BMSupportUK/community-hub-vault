import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

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
  order_ref: string | null;
  manual_pay_method: string | null;
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
  if (v === "crypto") return "Crypto";
  if (v === "cash") return "Cash";
  if (v === "wise") return "Wise";
  return provider ? provider : "—";
}

export function OrderStatusAdminCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [methods, setMethods] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);

  const [reload, setReload] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const needsRef = ["square", "stripe", "wise"].includes(payMethod);
  const completeOrder = async (id: string) => {
    if (needsRef && !payRef.trim()) return toast.error(payMethod === "wise" ? "Enter the Wise transfer number" : `Enter the ${paymentLabel(payMethod)} transaction ID`);
    if (!confirm(payMethod ? `Mark this order as complete, paid by ${paymentLabel(payMethod)}?` : "Mark this order as complete using the payment method saved with it?")) return;
    const { error } = await supabase.rpc("admin_complete_manual_order", { _order_id: id, _method: payMethod || undefined, _reference: payRef.trim() || undefined });
    if (error) return toast.error(error.message);
    toast.success("Order marked complete");
    setCompleting(null); setPayMethod(""); setPayRef("");
    setReload((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status, total_cents, created_at, paid_at, completed_at, shipping_name, existing_username, customer_type, order_ref, manual_pay_method")
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
  }, [reload]);

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
        {isAdmin && (
          <Link to="/admin-add-order" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            <Plus className="size-4" /> Add order
          </Link>
        )}
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
                        <div className="text-xs text-muted-foreground">{r.order_ref ?? `#${r.id.slice(0, 8)}`}{r.customer_type ? ` · ${r.customer_type}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{money(r.total_cents)}</td>
                      <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full border text-xs capitalize ${statusTone(r.status)}`}>{r.status.toLowerCase()}</span></td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{r.paid_at ? new Date(r.paid_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{isAdmin && r.customer_type === "manual" && !r.completed_at ? (
                        completing === r.id ? (
                        <div className="flex items-center gap-1.5">
                          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} aria-label="Payment method" className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground">
                            <option value="">Use saved method</option>
                            <option value="square">Square</option>
                            <option value="stripe">Stripe</option>
                            <option value="wise">Wise</option>
                            <option value="crypto">Crypto</option>
                            <option value="cash">Cash</option>
                          </select>
                          {needsRef && <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder={payMethod === "wise" ? "Wise transfer no." : "Transaction ID"} aria-label="Transaction ID" className="h-7 w-36 rounded-md border border-border bg-background px-1.5 text-xs text-foreground" />}
                          <button type="button" onClick={() => completeOrder(r.id)} aria-label="Confirm complete" className="h-7 px-2 rounded-md bg-success/15 border border-success/40 text-success"><Check className="size-3.5" /></button>
                          <button type="button" onClick={() => { setCompleting(null); setPayMethod(""); }} aria-label="Cancel" className="h-7 px-2 rounded-md border border-border text-muted-foreground"><X className="size-3.5" /></button>
                        </div>
                      ) : <button type="button" onClick={() => { setCompleting(r.id); setPayMethod(r.manual_pay_method ?? ""); setPayRef(""); }} className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-success/40 text-success text-xs font-medium hover:bg-success/10"><Check className="size-3.5" /> Mark complete</button>
                      ) : r.completed_at ? new Date(r.completed_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—"}</td>
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

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchInChunks } from "@/lib/chunked-in";
import { downloadReceipt } from "@/lib/receipt";

type Provider = "square" | "stripe" | "cash" | "bank_transfer";

const PROVIDER_LABELS: Record<Provider, string> = {
  square: "Square",
  stripe: "Stripe",
  cash: "Cash",
  bank_transfer: "Bank transfer",
};
type Row = {
  id: string;
  order_id: string;
  provider: string;
  status: string;
  amount_cents: number;
  currency: string;
  provider_payment_id: string | null;
  created_at: string;
  order?: {
    id: string;
    order_ref: string | null;
    created_at: string;
    status: string | null;
    total_cents: number;
    discount_cents: number | null;
    discount_code: string | null;
    shipping_name: string | null;
    shipping_address: string | null;
    email: string | null;
    existing_username: string | null;
    customer_type: string | null;
    paid_at: string | null;
    completed_at: string | null;
    manual_pay_method: string | null;
  } | null;
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

export function CardPaymentsAdminCard({ provider }: { provider: Provider }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("order_payments")
        .select("id, order_id, provider, provider_payment_id, status, amount_cents, currency, created_at")
        .in("provider", ["square", "stripe", "cash", "bank_transfer"])
        .order("created_at", { ascending: false })
        .limit(2000);
      if (cancelled) return;
      if (error) return setError(error.message);
      const ids = Array.from(new Set((data ?? []).map((r) => r.order_id)));
      const orders: Record<string, Row["order"]> = {};
      if (ids.length) {
        try {
          const o = await fetchInChunks<{ id: string }>(ids, (chunk) =>
            supabase
              .from("orders")
              .select("id, order_ref, created_at, status, total_cents, discount_cents, discount_code, shipping_name, shipping_address, email, existing_username, customer_type, paid_at, completed_at, manual_pay_method")
              .in("id", chunk),
          );
          for (const x of o) if (x.id) orders[x.id] = x as never;
        } catch (e) {
          if (!cancelled) setError(e instanceof Error ? e.message : "Could not load customer details");
          return;
        }
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
  const downloadInvoice = async (row: Row) => {
    if (!row.order?.paid_at || row.order.status === "cancelled") return;
    setDownloading(row.id);
    try {
      const { data: items, error } = await supabase.from("order_items").select("product_name,quantity,unit_price_cents").eq("order_id", row.order_id);
      if (error) throw error;
      await downloadReceipt({ ...row.order, status: row.order.status || "paid", manual_pay_method: row.provider }, items ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create invoice");
    } finally {
      setDownloading(null);
    }
  };

  const pill = (active: boolean) => `px-3 h-8 rounded-lg text-sm font-medium border transition-colors ${active ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-display text-lg font-semibold">{PROVIDER_LABELS[provider]} payments</h2>
        <p className="text-sm text-muted-foreground">Orders with their payment status, by year and month.</p>
      </div>

      {error ? <p className="text-sm text-destructive">Could not load payments: {error}</p>
        : rows === null ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>
        : list.length === 0 ? <p className="text-sm text-muted-foreground">No {PROVIDER_LABELS[provider]} payments yet.</p>
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
                    <th className="px-3 py-2 font-medium">
                      {provider === "stripe"
                        ? "Stripe transaction"
                        : provider === "square"
                          ? "Square transaction"
                          : provider === "bank_transfer"
                            ? "Reference"
                            : "Method"}
                    </th>
                    <th className="px-3 py-2 font-medium">BM Support invoice</th>
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
                      <td className="px-3 py-2 max-w-[240px]">
                        {provider === "cash" ? (
                          "Cash"
                        ) : r.provider_payment_id ? (
                          <span className="font-mono text-xs break-all" title={r.provider_payment_id}>{r.provider_payment_id}</span>
                        ) : (
                          <span className="text-muted-foreground">Not recorded</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.order?.paid_at && r.order.status !== "cancelled" ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => void downloadInvoice(r)} disabled={downloading === r.id}>
                            {downloading === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                            Download PDF
                          </Button>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
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

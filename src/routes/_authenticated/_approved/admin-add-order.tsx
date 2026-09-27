import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Plus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";

export const Route = createFileRoute("/_authenticated/_approved/admin-add-order")({
  head: () => ({
    meta: [
      { title: "Add order — BM Support" },
      { name: "description", content: "Manually add a customer order in the admin dashboard." },
      { property: "og:title", content: "Add order — BM Support" },
      { property: "og:description", content: "Manually add a customer order in the admin dashboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AddOrderPage,
});

function money(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(cents / 100);
}

function AddOrderPage() {
  const { hasRole, user } = useAuth();
  const navigate = useNavigate();
  const [custName, setCustName] = useState("");
  const [products, setProducts] = useState<{ id: string; name: string; price_cents: number }[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [payMethod, setPayMethod] = useState("");
  const [payRef, setPayRef] = useState("");
  const needsRef = ["square", "stripe", "wise"].includes(payMethod);

  useEffect(() => {
    supabase.from("products").select("id, name, price_cents").order("sort_order").then(({ data }) => setProducts((data ?? []) as never));
  }, []);

  if (!hasRole("admin")) return <Navigate to="/admin" />;
  if (!isAdminUnlocked(user?.id)) return <Navigate to="/admin" search={{ next: "/admin-add-order" } as never} />;

  const back = () => navigate({ to: "/admin", search: { tab: "order-status" } as never });

  const save = async () => {
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!custName.trim()) return toast.error("Enter the customer name");
    if (!items.length) return toast.error("Pick at least one product");
    if (!payMethod) return toast.error("Pick the payment method");
    if (needsRef && !payRef.trim()) return toast.error("Enter the transaction ID");
    setBusy(true);
    const { data: id, error } = await supabase.rpc("admin_create_manual_order", { _customer_name: custName.trim(), _items: items, _method: payMethod, _reference: payRef.trim() || undefined });
    if (error) { setBusy(false); return toast.error(error.message); }
    const { data: o } = await supabase.from("orders").select("order_ref").eq("id", id as string).maybeSingle();
    setBusy(false);
    toast.success(`Order ${o?.order_ref ?? ""} added`);
    back();
  };

  const total = (products ?? []).reduce((a, p) => a + p.price_cents * (qty[p.id] ?? 0), 0);

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto px-6 py-8 space-y-6">
        <Link to="/admin" search={{ tab: "order-status" } as never} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to order status
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow"><Plus className="size-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold">Add an order</h1>
            <p className="text-sm text-muted-foreground">Saved orders get their own MANUAL reference.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Customer name" className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          <div className="space-y-2">
            {products === null ? <p className="text-sm text-muted-foreground">Loading products…</p> : products.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{p.name} <span className="text-muted-foreground">· {money(p.price_cents)}</span></span>
                <input type="number" min={0} value={qty[p.id] ?? 0} onChange={(e) => setQty((q) => ({ ...q, [p.id]: Math.max(0, Number(e.target.value) || 0) }))} className="w-20 h-9 rounded-lg border border-border bg-background px-2 text-sm" aria-label={`Quantity of ${p.name}`} />
              </div>
            ))}
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-sm font-medium" htmlFor="pay-method">Payment method</label>
            <select id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm">
              <option value="">Choose how the customer paid…</option>
              <option value="square">Square</option>
              <option value="stripe">Stripe</option>
              <option value="wise">Wise</option>
              <option value="crypto">Crypto</option>
              <option value="cash">Cash</option>
            </select>
            {needsRef && <input value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="Transaction ID" className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm" />}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <span className="text-sm text-muted-foreground">Total {money(total)}</span>
            <div className="flex gap-2">
              <button type="button" onClick={back} className="h-9 px-4 rounded-lg border border-border text-sm font-medium">Cancel</button>
              <button type="button" disabled={busy} onClick={save} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">{busy ? "Saving…" : "Save order"}</button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

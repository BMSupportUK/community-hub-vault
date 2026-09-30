import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarIcon, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useServerFn } from "@tanstack/react-start";
import { createSquareInvoiceForOrder } from "@/lib/square-invoices.functions";
import { createStripeInvoiceForOrder } from "@/lib/stripe-invoices.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { SecureLinkPanel } from "@/components/checkout/ManualOrderLinkDialog";

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
  const [orderDate, setOrderDate] = useState<Date>(new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [discount, setDiscount] = useState("");
  const [customerKind, setCustomerKind] = useState<"" | "new" | "existing">("");
  const [created, setCreated] = useState<{ id: string; ref: string; invoiceError?: string } | null>(null);
  const makeSquare = useServerFn(createSquareInvoiceForOrder);
  const makeStripe = useServerFn(createStripeInvoiceForOrder);

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
    if (!customerKind) return toast.error("Is this a new or existing customer?");
    if (!payMethod) return toast.error("Pick the payment method");
    const mail = email.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return toast.error("Enter a valid email address");
    if ((payMethod === "stripe" || payMethod === "square") && !mail) return toast.error("Card invoices need the customer's email address");
    const discountCents = Math.round((Number(discount) || 0) * 100);
    if (discountCents < 0) return toast.error("Discount can't be negative");
    setBusy(true);
    const now = new Date();
    const isToday = format(orderDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
    const createdAt = isToday
      ? undefined
      : new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    const { data: id, error } = await supabase.rpc("admin_create_manual_order_v2" as never, {
      _customer_name: custName.trim(),
      _items: items,
      _method: payMethod,
      _email: mail || null,
      _discount_cents: discountCents,
      _customer_kind: customerKind,
      _created_at: createdAt ? createdAt.toISOString() : null,
    } as never);
    if (error) { setBusy(false); return toast.error(error.message); }
    const { data: o } = await supabase.from("orders").select("order_ref").eq("id", id as string).maybeSingle();
    let invoiceError: string | undefined;
    try {
      if (payMethod === "square") await makeSquare({ data: { orderId: id as string } });
      if (payMethod === "stripe") {
        const r: any = await makeStripe({ data: { orderId: id as string, environment: getStripeEnvironment() } });
        if (r && "error" in r) invoiceError = r.error;
      }
    } catch (e) { invoiceError = (e as Error).message; }
    setBusy(false);
    toast.success(`Order ${o?.order_ref ?? ""} added`);
    if (invoiceError) toast.error(`Invoice not created: ${invoiceError}`);
    setCreated({ id: id as string, ref: o?.order_ref ?? "", invoiceError });
  };

  const subtotal = (products ?? []).reduce((a, p) => a + p.price_cents * (qty[p.id] ?? 0), 0);
  const discountCents = Math.min(subtotal, Math.max(0, Math.round((Number(discount) || 0) * 100)));
  const total = subtotal - discountCents;

  if (created) {
    return (
      <main className="flex-1 overflow-y-auto">
        <div className="w-full max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <h1 className="font-display text-2xl font-bold">Order {created.ref} created</h1>
            <p className="text-sm text-muted-foreground">Send the customer the secure page link and its password.</p>
            {created.invoiceError && <p className="text-sm text-destructive">The invoice could not be created: {created.invoiceError}. You can create it from the order later.</p>}
            <SecureLinkPanel orderId={created.id} withChat={false} />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={back} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Back to Orders</button>
              <button type="button" onClick={() => { setCreated(null); setQty({}); setCustName(""); setEmail(""); setDiscount(""); setCustomerKind(""); setPayMethod(""); }} className="h-9 px-4 rounded-lg border border-border text-sm font-medium">Add another</button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full max-w-2xl mx-auto px-6 py-8 space-y-6">
        <Link to="/admin" search={{ tab: "order-status" } as never} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Orders
        </Link>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center text-primary-foreground shadow-glow"><Plus className="size-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-bold">Add an order</h1>
            <p className="text-sm text-muted-foreground">Saved orders get their own MANUAL reference and secure checkout page. <Link to="/admin-checkout-templates" className="text-primary hover:underline">View page templates</Link></p>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Customer name" className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Customer email (needed for Stripe / Square invoices)" className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          <div className="space-y-1.5">
            <div className="text-sm font-medium">Customer</div>
            <div className="flex gap-2">
              {(["new", "existing"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setCustomerKind(k)} className={`flex-1 h-10 rounded-lg border text-sm font-medium ${customerKind === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{k === "new" ? "New customer" : "Existing customer"}</button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">When complete, the secure page tells new customers their account is set up, and existing customers their subscription is upgraded.</p>
          </div>
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
              <option value="">Choose how the customer wants to pay…</option>
              <option value="square">Square</option>
              <option value="stripe">Stripe</option>
              <option value="wise">Wise</option>
              <option value="cash">Cash</option>
            </select>
            <p className="text-xs text-muted-foreground">Stripe and Square create an invoice with a pay button; Wise shows your bank details; Cash shows a thank-you page.</p>
          </div>
          <div className="space-y-2 pt-2 border-t border-border">
            <label className="text-sm font-medium" htmlFor="order-date">Order date</label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button id="order-date" variant="outline" className="w-full justify-start text-left font-normal h-10">
                  <CalendarIcon className="mr-2 size-4" />
                  {format(orderDate, "d MMMM yyyy")}
                  {format(orderDate, "yyyy-MM-dd") !== format(new Date(), "yyyy-MM-dd") && (
                    <span className="ml-2 text-xs text-muted-foreground">(backdated)</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={orderDate}
                  onSelect={(d) => { if (d) { setOrderDate(d); setCalendarOpen(false); } }}
                  disabled={{ after: new Date() }}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">Defaults to today — pick an earlier date to backdate the order.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-muted-foreground flex items-center gap-2">Discount £
                <input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-sm" aria-label="Discount in pounds" />
              </label>
              <span className="text-sm text-muted-foreground">{discountCents > 0 ? <><s>{money(subtotal)}</s> </> : null}Total <span className="font-semibold text-foreground">{money(total)}</span></span>
            </div>
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

import { STRIPE_CHECKOUT_ENABLED, effectiveCardProvider } from "@/lib/payment-methods";
import { useEffect, useState } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CalendarIcon, Check, Plus, Search, Users } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { customerDate } from "@/lib/customer-date";
import {
  discountCodeCents,
  discountCodeLabel,
  pickCustomerDiscountCodes,
  type CustomerDiscountCode,
} from "@/lib/manual-order-discount";

type ManualCustomer = { userId: string; username: string | null; displayName: string | null; hasSiteAccount: boolean; accounts: { id: string; login: string; expiresAt: string | null }[] };

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
  const [skipRegistration, setSkipRegistration] = useState(false);
  const [created, setCreated] = useState<{ id: string; ref: string; invoiceError?: string } | null>(null);

  const [manualCustomers, setManualCustomers] = useState<ManualCustomer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [renewalAccountId, setRenewalAccountId] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customerCodes, setCustomerCodes] = useState<Record<string, CustomerDiscountCode>>({});
  const [appliedCode, setAppliedCode] = useState<CustomerDiscountCode | null>(null);

  useEffect(() => {
    supabase.from("products").select("id, name, price_cents").order("sort_order").then(({ data }) => setProducts((data ?? []) as never));
  }, []);
  useEffect(() => {
    if (!hasRole("admin")) return;
    void supabase.rpc("admin_customer_subscription_list").then(({ data, error }) => {
      setLookupError(error?.message ?? "");
      setManualCustomers(((data ?? []) as unknown as ManualCustomer[]).filter((c) => !c.hasSiteAccount));
      setCustomersLoading(false);
    });
    // Codes saved against each customer, so picking a name can apply their discount.
    void supabase
      .from("discount_codes")
      .select("user_id,code,percent,amount_cents")
      .eq("is_active", true)
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => setCustomerCodes(pickCustomerDiscountCodes(data as never)));
  }, [user?.id]);

  if (!hasRole("admin")) return <Navigate to="/admin" />;
  if (!isAdminUnlocked(user?.id)) return <Navigate to="/admin" search={{ next: "/admin-add-order" } as never} />;

  const back = () => navigate({ to: "/admin", search: { tab: "order-status" } as never });

  const save = async () => {
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([product_id, quantity]) => ({ product_id, quantity }));
    if (!custName.trim()) return toast.error("Enter the customer name");
    if (!items.length) return toast.error("Pick at least one product");
    if (!customerKind) return toast.error("Is this a new or existing customer?");
    if (customerKind === "existing" && (!customerId || !renewalAccountId)) return toast.error("Choose the manual customer and account to renew");
    if (!payMethod) return toast.error("Pick the payment method");
    const mail = email.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return toast.error("Enter a valid email address");
    if ((payMethod === "stripe" || payMethod === "square") && !mail) return toast.error("Card invoices need the customer's email address");
    const manualCents = Math.round((Number(discount) || 0) * 100);
    if (!appliedCode && manualCents < 0) return toast.error("Discount can't be negative");
    const orderSubtotal = (products ?? []).reduce((a, p) => a + p.price_cents * (qty[p.id] ?? 0), 0);
    const discountCents = appliedCode
      ? discountCodeCents(appliedCode, orderSubtotal)
      : Math.min(orderSubtotal, Math.max(0, manualCents));
    setBusy(true);
    const now = new Date();
    const isToday = format(orderDate, "yyyy-MM-dd") === format(now, "yyyy-MM-dd");
    const createdAt = isToday
      ? undefined
      : new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate(), now.getHours(), now.getMinutes(), now.getSeconds());
    const { data: id, error } = await supabase.rpc("admin_create_manual_order_v4", {
      _customer_name: custName.trim(),
      _items: items,
      _method: payMethod,
      _email: mail || undefined,
      _discount_cents: discountCents,
      _customer_kind: customerKind,
      _created_at: createdAt ? createdAt.toISOString() : undefined,
      _customer_id: customerKind === "existing" ? customerId : undefined,
      _account_id: customerKind === "existing" ? renewalAccountId : undefined,
      _skip_registration: skipRegistration,
    });
    if (error) { setBusy(false); return toast.error(error.message); }
    const { data: o } = await supabase.from("orders").select("order_ref").eq("id", id as string).maybeSingle();
    const invoiceError: string | undefined = undefined;
    setBusy(false);
    toast.success(`Order ${o?.order_ref ?? ""} added`);
    if (invoiceError) toast.error(`Invoice not created: ${invoiceError}`);
    setCreated({ id: id as string, ref: o?.order_ref ?? "", invoiceError });
  };

  const subtotal = (products ?? []).reduce((a, p) => a + p.price_cents * (qty[p.id] ?? 0), 0);
  const discountCents = appliedCode
    ? discountCodeCents(appliedCode, subtotal)
    : Math.min(subtotal, Math.max(0, Math.round((Number(discount) || 0) * 100)));
  const total = subtotal - discountCents;
  const matchingCustomers = manualCustomers.filter((customer) =>
    [customer.username, customer.displayName, ...customer.accounts.map((account) => account.login)]
      .some((value) => value?.toLowerCase().includes(customerSearch.trim().toLowerCase())),
  );

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
              <Button variant="outline" onClick={() => { setCreated(null); setQty({}); setCustName(""); setEmail(""); setDiscount(""); setCustomerKind(""); setSkipRegistration(false); setPayMethod(""); setCustomerId(""); setRenewalAccountId(""); setAppliedCode(null); }}>Add another</Button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8 space-y-6">
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
        <div className="flex gap-2">
          {(["new", "existing"] as const).map((kind) => (
            <Button key={kind} variant={customerKind === kind ? "default" : "outline"} aria-pressed={customerKind === kind} onClick={() => { setCustomerKind(kind); setCustomerId(""); setRenewalAccountId(""); setAppliedCode(null); }} className="min-w-0 flex-1 h-10 sm:flex-none sm:px-6">{kind === "new" ? "New customer" : "Existing customer"}</Button>
          ))}
        </div>
        <div className="flex min-w-0 flex-row items-start gap-4 sm:gap-6" style={{ display: "flex", flexDirection: "row", alignItems: "flex-start" }}>
        <div className="min-w-0 flex-1 space-y-5" style={{ flex: "1 1 0%", minWidth: 0 }}>
          <input aria-label="Customer name" value={custName} onChange={(e) => { setCustName(e.target.value); setCustomerId(""); setRenewalAccountId(""); setAppliedCode(null); }} placeholder="Customer name" className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Customer email (needed for Stripe / Square invoices)" className="w-full h-10 rounded-lg border border-border bg-background px-3 text-sm" />
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
              {STRIPE_CHECKOUT_ENABLED && <option value="stripe">Stripe</option>}
              <option value="wise">Wise (bank transfer, UK only)</option>
              <option value="cash">Cash</option>
            </select>
            <p className="text-xs text-muted-foreground">Square shows a payable invoice on the checkout page; Wise shows your bank details (UK customers only); Cash shows a thank-you page.</p>
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
              {appliedCode ? (
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  Discount code <span className="font-mono text-foreground">{appliedCode.code}</span> applied ({discountCodeLabel(appliedCode)})
                  <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAppliedCode(null)}>Remove</Button>
                </span>
              ) : (
                <label className="text-sm text-muted-foreground flex items-center gap-2">Discount £
                  <input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0.00" className="w-24 h-9 rounded-lg border border-border bg-background px-2 text-sm" aria-label="Discount in pounds" />
                </label>
              )}
              <span className="text-sm text-muted-foreground">{discountCents > 0 ? <><s>{money(subtotal)}</s> </> : null}Total <span className="font-semibold text-foreground">{money(total)}</span></span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={back}>Cancel</Button>
              <Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save order"}</Button>
            </div>
          </div>
        </div>
        <aside aria-label="Manual customers" className="shrink-0 self-stretch border-l border-border pl-4 sm:pl-6" style={{ flex: "0 0 auto", width: "clamp(180px, 30%, 380px)" }}>
          <div className="space-y-4 sticky top-6">
            <label htmlFor="skip-registration" className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm"><Checkbox id="skip-registration" className="mt-0.5 shrink-0" checked={skipRegistration} onCheckedChange={(value) => setSkipRegistration(value === true)} /><span>Bypass account creation at the end of this order</span></label>
            {customerKind === "existing" && <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Users className="size-5 text-primary" />Manual customers</h2>}
            {customerKind === "existing" ? <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                <input aria-label="Search manual customers" placeholder="Search name or login" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm" />
              </div>
              {lookupError && <p role="alert" className="text-sm text-destructive">{lookupError}</p>}
              {customersLoading ? <p role="status" className="text-sm text-muted-foreground">Loading customers…</p> : <div className="max-h-[65dvh] overflow-y-auto space-y-3 pr-1">
                {matchingCustomers.length === 0 && <p className="text-sm text-muted-foreground">No manual customers found.</p>}
                {matchingCustomers.map((customer) => {
                  const selected = customerId === customer.userId;
                  const code = customerCodes[customer.userId];
                  const label = customer.username || customer.displayName || "Manual customer";
                  return <div key={customer.userId} className="border-b border-border pb-3 space-y-2">
                    <Button variant={selected ? "secondary" : "ghost"} aria-pressed={selected} className="h-auto w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left" onClick={() => {
                      setCustomerId(customer.userId);
                      setRenewalAccountId(customer.accounts.length === 1 ? customer.accounts[0].id : "");
                      setCustName(customer.username || customer.displayName || "");
                      setAppliedCode(code ?? null);
                    }}>
                      <span className="min-w-0 flex-1 break-words">{label}</span>
                      {selected && <Check className="size-4 shrink-0" />}
                    </Button>
                    {selected && customer.accounts.length > 1 && customer.accounts.map((account, index) => <Button key={account.id} variant={renewalAccountId === account.id ? "default" : "outline"} aria-pressed={renewalAccountId === account.id} className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left" onClick={() => {
                      setCustomerId(customer.userId); setRenewalAccountId(account.id);
                    }}>
                      <span className="min-w-0 space-y-1">
                        <span className="block break-words">Account {index + 1}: {account.login}</span>
                        <span className="block text-xs opacity-80">Subscription expires {customerDate(account.expiresAt)}</span>
                      </span>
                      {renewalAccountId === account.id && <Check className="ml-auto size-4 shrink-0" />}
                    </Button>)}
                  </div>;
                })}
              </div>}
            </> : null}
          </div>
        </aside>
        </div>
      </div>
    </main>
  );
}

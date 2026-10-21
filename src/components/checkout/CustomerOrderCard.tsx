import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Ban, Download, Loader2, Lock, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrency } from "@/hooks/use-currency";
import { Nameplate } from "@/components/app/Nameplate";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { RequestOrderPasswordButton } from "./RequestOrderPasswordButton";
import { getOrderPaymentState } from "@/lib/order-payment-state.functions";
import { cancelOrderAndSquareInvoice } from "@/lib/square-invoices.functions";
import { getAutomatedMessage } from "@/lib/automated-messages";
import { downloadReceipt } from "@/lib/receipt";
import { accountTypeLabelFor, deriveOrderTerms } from "@/lib/order-terms";

interface CustomerOrder {
  id: string;
  user_id: string;
  status: string;
  total_cents: number;
  created_at: string;
  shipping_name: string | null;
  notes: string | null;
  paid_at?: string | null;
  completed_at?: string | null;
  customer_type?: string | null;
  existing_username?: string | null;
  wants_adult_content?: boolean | null;
  discount_code?: string | null;
  discount_cents?: number | null;
}
interface Item {
  id: string;
  order_id: string;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
}
interface Buyer {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  equipped_nameplate_id: string | null;
}

/** Both customer order lists share details and existing owner-only actions here. */
export function CustomerOrderCard({ order, onOpenCheckout }: {
  order: CustomerOrder;
  onOpenCheckout: () => void;
}) {
  const { user } = useAuth();
  const { format } = useCurrency();
  const navigate = useNavigate();
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<Awaited<ReturnType<typeof getOrderPaymentState>> | null>(null);
  const readPayment = useServerFn(getOrderPaymentState);
  const cancelInvoice = useServerFn(cancelOrderAndSquareInvoice);

  useEffect(() => {
    let off = false;
    const load = async () => {
      try {
        const [itemResult, profileResult, ticketResult, pay] = await Promise.all([
          supabase.from("order_items").select("id,order_id,product_name,quantity,unit_price_cents").eq("order_id", order.id),
          supabase.from("profiles").select("username,display_name,avatar_url,equipped_nameplate_id").eq("id", order.user_id).maybeSingle(),
          supabase.from("tickets").select("id").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          readPayment({ data: { orderId: order.id } }),
        ]);
        if (off) return;
        if (itemResult.error) throw itemResult.error;
        setItems(itemResult.data ?? []);
        setBuyer(profileResult.data);
        setTicketId(ticketResult.data?.id ?? null);
        setPayment(pay);
        setLoadError(false);
      } catch {
        if (!off) setLoadError(true);
      } finally {
        if (!off) setLoading(false);
      }
    };
    void load();
    const channel = supabase.channel(`customer-order-card-${order.id}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${order.id}` }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${order.id}` }, () => void load())
      .subscribe();
    return () => { off = true; void supabase.removeChannel(channel); };
  }, [order.id, order.user_id, order.status, order.paid_at, readPayment]);

  const paid = !!order.paid_at || order.status === "paid" || !!payment?.settled;
  const completed = order.status === "completed" || !!order.completed_at;
  const cancelled = order.status === "cancelled";
  const bankAwaiting = payment?.provider === "bank_transfer" && payment.paymentStatus?.toLowerCase() === "awaiting_verification" && !paid;
  const name = buyer?.display_name || buyer?.username || order.shipping_name || "You";
  const status = cancelled ? "Cancelled" : completed ? "Completed" : paid ? "Account setup" : order.status === "processing" || payment?.provider ? "Awaiting payment" : "New order — please pay";
  const date = (value: string) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  const notifyChanged = () => window.dispatchEvent(new CustomEvent("orders:changed", { detail: { orderId: order.id } }));
  const sendSystem = async (content: string) => {
    if (!user) return;
    if (ticketId) {
      await supabase.from("ticket_messages").insert({ ticket_id: ticketId, sender_id: user.id, content });
    } else {
      await supabase.from("order_messages").insert({ order_id: order.id, sender_id: user.id, content });
    }
  };
  const cancel = async () => {
    if (busy || paid || completed || cancelled || bankAwaiting || loading || loadError) return;
    if (!window.confirm("Cancel this order? This cannot be undone.")) return;
    setBusy(true);
    try {
      const result = await cancelInvoice({ data: { orderId: order.id } });
      await sendSystem(await getAutomatedMessage("order_cancelled", { cancelled_by: "customer" }));
      if (result.invoiceCancelled) await sendSystem(await getAutomatedMessage("order_invoice_cancelled"));
      else if (result.invoiceError && !/No Square invoice|PAID/i.test(result.invoiceError)) {
        toast.warning("Order cancelled, but the Square invoice could not be cancelled automatically.");
      }
      toast.success("Order cancelled");
      notifyChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not cancel the order");
    } finally { setBusy(false); }
  };
  const removeItem = async (item: Item) => {
    if (busy || paid || completed || order.status !== "pending") return;
    if (items.length <= 1) { toast.error("Cannot remove the last item. Cancel the order instead."); return; }
    if (!window.confirm(`Remove "${item.product_name}" from this order?`)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("order_items").delete().eq("id", item.id);
      if (error) throw error;
      await sendSystem(`🗑️ Removed "${item.product_name}" from this order.`);
      setItems(current => current.filter(row => row.id !== item.id));
      notifyChanged();
      toast.success("Item removed");
    } catch { toast.error("Could not remove the item"); }
    finally { setBusy(false); }
  };

  return (
    <article aria-label={`Order ${order.id.slice(0, 8)}`} className="min-w-0 overflow-hidden rounded-lg border border-primary/35 bg-surface/95 shadow-soft flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <span className="font-mono text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
        {user?.id === order.user_id && !cancelled && !completed && (
          <Button variant="outline" size="sm" onClick={cancel} disabled={busy || paid || bankAwaiting || loading || loadError} className="border-destructive/40 text-destructive" title={paid ? "Paid orders cannot be cancelled" : bankAwaiting ? "Bank transfer reported — cannot cancel while we verify your payment" : "Cancel order"}>
            {busy ? <Loader2 className="animate-spin" /> : <Ban />} Cancel order
          </Button>
        )}
      </div>
      <Nameplate id={buyer?.equipped_nameplate_id} className="bg-gradient-primary min-h-20">
        <div className="relative flex items-center gap-3 bg-background/45 px-4 py-4">
          <Avatar className="size-10 shrink-0 ring-2 ring-border"><AvatarImage src={buyer?.avatar_url ?? undefined} alt={name} /><AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback></Avatar>
          <div className="min-w-0"><div className="text-[10px] uppercase text-primary-foreground/80">Placed by</div><div className="break-words text-sm font-semibold text-primary-foreground">{name}</div></div>
        </div>
      </Nameplate>
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><div className="text-[10px] uppercase text-muted-foreground">Order total</div><div className="font-display text-2xl font-bold">{format(order.total_cents)}</div></div>
          <span className={`max-w-full rounded border px-2 py-1 text-xs font-semibold ${cancelled ? "border-destructive/40 bg-destructive/10 text-destructive" : completed ? "border-success/40 bg-success/10 text-success" : "border-primary/40 bg-primary/10 text-foreground"}`}>{status}</span>
        </div>
        <div className="border-y border-border py-3">
          <h3 className="mb-2 text-xs font-semibold text-muted-foreground">Ordered items</h3>
          {loading ? <Loader2 className="size-4 animate-spin" aria-label="Loading items" /> : loadError ? <p className="text-xs text-destructive">Could not load order details. Please refresh.</p> : (
            items.length === 0 ? <p className="text-xs text-muted-foreground">No items recorded</p> : <ul className="space-y-3">{items.map(item => <li key={item.id} className="flex items-start justify-between gap-3 text-sm"><div className="min-w-0 flex-1 break-words">{item.product_name}<div className="text-xs text-muted-foreground">Quantity: {item.quantity} · {format(item.unit_price_cents)} each</div></div><div className="shrink-0 text-right font-medium">{format(item.unit_price_cents * item.quantity)}{user?.id === order.user_id && order.status === "pending" && !paid && !completed && <Button size="icon" variant="ghost" className="ml-1 size-6 text-muted-foreground" title={`Remove ${item.product_name}`} aria-label={`Remove ${item.product_name}`} onClick={() => removeItem(item)} disabled={busy}><Trash2 /></Button>}</div></li>)}</ul>
          )}
        </div>
        <div className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2">
          <dl className="min-w-0 space-y-2">
            {order.shipping_name && <Detail label="Customer" value={order.shipping_name} />}
            <Detail label="Placed" value={date(order.created_at)} />
            {order.customer_type && <Detail label="Order type" value={order.customer_type === "existing" ? "Renewal" : "New customer"} />}
            {order.existing_username && <Detail label="Account" value={order.existing_username} />}
            {order.discount_code && <Detail label="Discount" value={`${order.discount_code} (−${format(order.discount_cents ?? 0)})`} />}
            {(order.paid_at || payment?.paidAt) && <Detail label="Paid" value={date(order.paid_at || payment?.paidAt || order.created_at)} />}
            {order.completed_at && <Detail label="Completed" value={date(order.completed_at)} />}
            {bankAwaiting && <Detail label="Payment" value="Bank transfer awaiting verification" />}
          </dl>
          <dl className="min-w-0 space-y-2">
            <Detail label="Package" value={packageLabel} hint={packageHint} />
            {typeof order.wants_adult_content === "boolean" && <Detail label="Adult content" value={order.wants_adult_content ? "Yes" : "No"} />}
          </dl>
          {order.notes && <div className="min-w-0 sm:col-span-2"><Detail label="Notes" value={order.notes} /></div>}
        </div>
        <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
          {!cancelled && <><Button size="sm" onClick={onOpenCheckout}><Lock /> Open secure checkout</Button><RequestOrderPasswordButton orderId={order.id} /></>}
          {paid && !cancelled && <Button variant="outline" size="sm" onClick={() => downloadReceipt(order, items).catch(() => toast.error("Could not generate PDF"))}><Download /> Invoice PDF</Button>}
          {ticketId && <Button variant="outline" size="sm" onClick={() => navigate({ to: "/tickets", search: { id: ticketId } })}><Receipt /> Support ticket</Button>}
        </div>
      </div>
    </article>
  );
}

function Detail({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return <div className="grid gap-0.5"><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-line break-words font-medium">{value}{hint ? <div className="font-normal text-muted-foreground">{hint}</div> : null}</dd></div>;
}
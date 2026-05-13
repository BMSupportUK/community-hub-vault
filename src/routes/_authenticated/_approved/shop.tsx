import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ChannelColumn, type ChannelGroup } from "@/components/app/ChannelColumn";
import { ShoppingBag, Package, Settings, Plus, Minus, X, Send, Trash2, Pencil, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type View = "store" | "orders" | "admin";

export const Route = createFileRoute("/_authenticated/_approved/shop")({
  validateSearch: (s: Record<string, unknown>) => ({
    view: (s.view === "orders" || s.view === "admin" ? s.view : "store") as View,
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: ShopPage,
});

interface Product {
  id: string; name: string; description: string | null; price_cents: number;
  image_url: string | null; category: string | null; stock: number | null;
  is_active: boolean; sort_order: number;
}
interface Order {
  id: string; user_id: string; status: string; total_cents: number;
  shipping_name: string | null; shipping_address: string | null; notes: string | null;
  created_at: string;
}
interface OrderItem { id: string; order_id: string; product_name: string; unit_price_cents: number; quantity: number; }
interface OrderMessage { id: string; order_id: string; sender_id: string; content: string; created_at: string; }

const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

function ShopPage() {
  const { view, id } = Route.useSearch();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);

  const groups: ChannelGroup[] = [
    { label: "Shop", items: [
      { to: "/shop", label: "Storefront", icon: ShoppingBag },
      { to: "/shop", label: "My Orders", icon: Package },
    ]},
    ...(isAdmin ? [{ label: "Admin", items: [{ to: "/shop", label: "Manage", icon: Settings }] }] : []),
  ];

  return (
    <>
      <nav className="w-60 shrink-0 bg-surface flex flex-col border-r border-border">
        <div className="h-14 flex items-center px-4 border-b border-border shadow-soft">
          <h2 className="font-display font-semibold text-sm tracking-wide">Shop</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          <SideBtn active={view === "store"} onClick={() => navigate({ to: "/shop", search: { view: "store" } })} Icon={ShoppingBag} label="Storefront" />
          <SideBtn active={view === "orders"} onClick={() => navigate({ to: "/shop", search: { view: "orders" } })} Icon={Package} label="My Orders" />
          {isAdmin && (
            <>
              <div className="pt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Admin</div>
              <SideBtn active={view === "admin"} onClick={() => navigate({ to: "/shop", search: { view: "admin" } })} Icon={Settings} label="Manage Products" />
            </>
          )}
        </div>
        {user && (
          <div className="h-14 border-t border-border px-3 flex items-center gap-2 bg-rail">
            <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {(user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1"><div className="text-xs font-medium truncate">{user.email}</div></div>
          </div>
        )}
      </nav>
      {view === "store" && <Storefront />}
      {view === "orders" && <OrdersView selectedId={id} isAdmin={isAdmin} />}
      {view === "admin" && isAdmin && <AdminProducts />}
    </>
  );
}

function SideBtn({ active, onClick, Icon, label }: { active: boolean; onClick: () => void; Icon: any; label: string }) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors",
      active ? "bg-surface-2 text-foreground" : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground")}>
      <Icon className="size-4" /><span>{label}</span>
    </button>
  );
}

// ============ STOREFRONT ============
function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    supabase.from("products").select("*").eq("is_active", true).order("sort_order").then(({ data }) => setProducts(data ?? []));
  }, []);

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => p.category).filter(Boolean) as string[]);
    return ["All", ...Array.from(set)];
  }, [products]);
  const [cat, setCat] = useState("All");
  const filtered = cat === "All" ? products : products.filter((p) => p.category === cat);

  const cartItems = products.filter((p) => cart[p.id] > 0);
  const total = cartItems.reduce((s, p) => s + p.price_cents * cart[p.id], 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const sub = (id: string) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) - 1) }));

  const placeOrder = async (shipping: { name: string; address: string; notes: string }) => {
    if (!user || cartItems.length === 0) return;
    const { data: order, error } = await supabase.from("orders").insert({
      user_id: user.id, total_cents: total, status: "pending",
      shipping_name: shipping.name, shipping_address: shipping.address, notes: shipping.notes,
    }).select().single();
    if (error || !order) { toast.error(error?.message ?? "Failed"); return; }
    const items = cartItems.map((p) => ({
      order_id: order.id, product_id: p.id, product_name: p.name,
      unit_price_cents: p.price_cents, quantity: cart[p.id],
    }));
    const { error: ie } = await supabase.from("order_items").insert(items);
    if (ie) { toast.error(ie.message); return; }
    setCart({}); setShowCheckout(false);
    toast.success("Order placed!");
    navigate({ to: "/shop", search: { view: "orders", id: order.id } });
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <header className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <h1 className="font-display font-bold text-lg">Storefront</h1>
          <div className="flex gap-1 mt-0.5">
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cn("text-[11px] px-2 py-0.5 rounded-full transition",
                cat === c ? "bg-primary text-primary-foreground" : "bg-surface-2 text-muted-foreground hover:text-foreground")}>{c}</button>
            ))}
          </div>
        </div>
        <button onClick={() => setShowCheckout(true)} disabled={count === 0} className="relative px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50 flex items-center gap-2">
          <ShoppingBag className="size-4" /> Cart {count > 0 && <span className="bg-primary-foreground/20 px-1.5 rounded-full text-xs">{count}</span>}
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-20">No products yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((p) => (
              <div key={p.id} className="bg-surface rounded-xl overflow-hidden border border-border hover:border-primary/40 transition-colors flex flex-col">
                <div className="aspect-square bg-surface-2 grid place-items-center overflow-hidden">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <ImageIcon className="size-10 text-muted-foreground/40" />}
                </div>
                <div className="p-4 flex flex-col flex-1">
                  {p.category && <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{p.category}</div>}
                  <h3 className="font-semibold text-sm">{p.name}</h3>
                  {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                  <div className="mt-auto pt-3 flex items-center justify-between">
                    <span className="font-display font-bold text-lg">{fmt(p.price_cents)}</span>
                    {cart[p.id] ? (
                      <div className="flex items-center gap-1 bg-surface-2 rounded-lg">
                        <button onClick={() => sub(p.id)} className="size-7 grid place-items-center hover:text-primary"><Minus className="size-3.5" /></button>
                        <span className="text-sm font-medium w-5 text-center">{cart[p.id]}</span>
                        <button onClick={() => add(p.id)} className="size-7 grid place-items-center hover:text-primary"><Plus className="size-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => add(p.id)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90">Add</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showCheckout && <Checkout items={cartItems.map((p) => ({ ...p, qty: cart[p.id] }))} total={total} onClose={() => setShowCheckout(false)} onPlace={placeOrder} />}
    </main>
  );
}

function Checkout({ items, total, onClose, onPlace }: {
  items: (Product & { qty: number })[]; total: number; onClose: () => void;
  onPlace: (s: { name: string; address: string; notes: string }) => void;
}) {
  const [name, setName] = useState(""); const [address, setAddress] = useState(""); const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm grid place-items-center z-50 p-4">
      <div className="bg-surface rounded-2xl border border-border w-full max-w-lg shadow-soft">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-bold text-lg">Checkout</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="size-5" /></button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="space-y-2">
            {items.map((i) => (
              <div key={i.id} className="flex justify-between text-sm">
                <span>{i.name} <span className="text-muted-foreground">× {i.qty}</span></span>
                <span className="font-medium">{fmt(i.price_cents * i.qty)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-border font-display font-bold">
              <span>Total</span><span>{fmt(total)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none" />
            <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Shipping address" rows={2} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none resize-none" />
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Order notes (optional)" rows={2} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none resize-none" />
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-surface-2 text-sm">Cancel</button>
          <button onClick={() => onPlace({ name, address, notes })} disabled={!name || !address} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Place Order</button>
        </div>
      </div>
    </div>
  );
}

// ============ ORDERS + CHAT ============
const STATUS_COLOR: Record<string, string> = {
  pending: "text-warning bg-warning/10",
  processing: "text-primary bg-primary/10",
  shipped: "text-primary bg-primary/10",
  completed: "text-success bg-success/10",
  cancelled: "text-destructive bg-destructive/10",
};

function OrdersView({ selectedId, isAdmin }: { selectedId?: string; isAdmin: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = async () => {
    let q = supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (scope === "mine" && user) q = q.eq("user_id", user.id);
    const { data } = await q;
    setOrders(data ?? []);
  };
  useEffect(() => { load(); }, [scope, user?.id]);
  useEffect(() => {
    const ch = supabase.channel("orders-list").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [scope, user?.id]);

  return (
    <>
      <aside className="w-72 shrink-0 bg-surface border-r border-border flex flex-col">
        <div className="h-14 px-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display font-semibold text-sm">Orders</h2>
          {isAdmin && (
            <div className="flex bg-surface-2 rounded-md p-0.5 text-[11px]">
              <button onClick={() => setScope("mine")} className={cn("px-2 py-0.5 rounded", scope === "mine" && "bg-primary text-primary-foreground")}>Mine</button>
              <button onClick={() => setScope("all")} className={cn("px-2 py-0.5 rounded", scope === "all" && "bg-primary text-primary-foreground")}>All</button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {orders.length === 0 && <div className="text-xs text-muted-foreground p-4 text-center">No orders yet.</div>}
          {orders.map((o) => (
            <button key={o.id} onClick={() => navigate({ to: "/shop", search: { view: "orders", id: o.id } })}
              className={cn("w-full text-left p-3 rounded-lg transition", selectedId === o.id ? "bg-surface-2" : "hover:bg-surface-2/60")}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px] text-muted-foreground">#{o.id.slice(0, 8)}</span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", STATUS_COLOR[o.status] ?? "bg-surface-2")}>{o.status}</span>
              </div>
              <div className="font-display font-bold text-sm">{fmt(o.total_cents)}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{new Date(o.created_at).toLocaleDateString()}</div>
            </button>
          ))}
        </div>
      </aside>
      {selectedId ? <OrderDetail orderId={selectedId} isAdmin={isAdmin} /> : (
        <main className="flex-1 grid place-items-center text-muted-foreground text-sm">Select an order</main>
      )}
    </>
  );
}

function OrderDetail({ orderId, isAdmin }: { orderId: string; isAdmin: boolean }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [msgs, setMsgs] = useState<OrderMessage[]>([]);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    const [{ data: o }, { data: it }, { data: m }] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("order_items").select("*").eq("order_id", orderId),
      supabase.from("order_messages").select("*").eq("order_id", orderId).order("created_at"),
    ]);
    setOrder(o as Order | null); setItems(it ?? []); setMsgs(m ?? []);
  };
  useEffect(() => { load(); }, [orderId]);
  useEffect(() => {
    const ch = supabase.channel(`order-${orderId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` },
        (p) => setMsgs((m) => [...m, p.new as OrderMessage]))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        (p) => setOrder(p.new as Order))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  const send = async () => {
    if (!text.trim() || !user) return;
    const c = text; setText("");
    const { error } = await supabase.from("order_messages").insert({ order_id: orderId, sender_id: user.id, content: c });
    if (error) { toast.error(error.message); setText(c); }
  };

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from("orders").update({ status }).eq("id", orderId);
    if (error) toast.error(error.message);
  };

  if (!order) return <main className="flex-1 grid place-items-center text-muted-foreground text-sm">Loading…</main>;

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <header className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <div className="font-display font-bold text-sm">Order #{order.id.slice(0, 8)}</div>
          <div className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin ? (
            <select value={order.status} onChange={(e) => updateStatus(e.target.value)}
              className={cn("text-xs px-2 py-1 rounded font-medium border-0 outline-none", STATUS_COLOR[order.status])}>
              {["pending","processing","shipped","completed","cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <span className={cn("text-xs px-2 py-1 rounded font-medium", STATUS_COLOR[order.status])}>{order.status}</span>
          )}
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 shrink-0 border-r border-border bg-surface/50 p-4 overflow-y-auto space-y-4 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Items</div>
            <div className="space-y-1">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.product_name} <span className="text-muted-foreground">× {i.quantity}</span></span>
                  <span>{fmt(i.unit_price_cents * i.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-border font-display font-bold">
                <span>Total</span><span>{fmt(order.total_cents)}</span>
              </div>
            </div>
          </div>
          {order.shipping_name && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Shipping</div>
              <div>{order.shipping_name}</div>
              <div className="text-muted-foreground whitespace-pre-line text-xs">{order.shipping_address}</div>
            </div>
          )}
          {order.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
              <div className="text-muted-foreground text-xs whitespace-pre-line">{order.notes}</div>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="text-center text-[11px] text-muted-foreground">Chat with management about this order</div>
            {msgs.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[70%] px-3 py-2 rounded-2xl text-sm",
                    mine ? "bg-primary text-primary-foreground" : "bg-surface-2")}>
                    {m.content}
                    <div className={cn("text-[10px] mt-0.5", mine ? "text-primary-foreground/60" : "text-muted-foreground")}>
                      {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
          <div className="p-3 border-t border-border flex gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Message…" className="flex-1 px-3 py-2 rounded-lg bg-surface-2 text-sm outline-none border border-border focus:border-primary" />
            <button onClick={send} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground"><Send className="size-4" /></button>
          </div>
        </div>
      </div>
    </main>
  );
}

// ============ ADMIN ============
function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Partial<Product> | null>(null);

  const load = async () => {
    const { data } = await supabase.from("products").select("*").order("sort_order");
    setProducts(data ?? []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.name) return;
    const payload = {
      name: editing.name, description: editing.description ?? null,
      price_cents: editing.price_cents ?? 0, image_url: editing.image_url ?? null,
      category: editing.category ?? null, stock: editing.stock ?? null,
      is_active: editing.is_active ?? true, sort_order: editing.sort_order ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditing(null); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <header className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0">
        <h1 className="font-display font-bold text-lg">Manage Products</h1>
        <button onClick={() => setEditing({ is_active: true, price_cents: 0, sort_order: 0 })}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1">
          <Plus className="size-4" /> New Product
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted-foreground text-xs">
              <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Category</th><th className="text-right p-3">Price</th><th className="text-right p-3">Stock</th><th className="text-center p-3">Active</th><th className="p-3"></th></tr>
            </thead>
            <tbody>
              {products.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No products. Click "New Product" to add one.</td></tr>}
              {products.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-muted-foreground">{p.category ?? "—"}</td>
                  <td className="p-3 text-right">{fmt(p.price_cents)}</td>
                  <td className="p-3 text-right">{p.stock ?? "—"}</td>
                  <td className="p-3 text-center">{p.is_active ? "✓" : "—"}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => setEditing(p)} className="p-1.5 rounded hover:bg-surface-2"><Pencil className="size-3.5" /></button>
                    <button onClick={() => remove(p.id)} className="p-1.5 rounded hover:bg-surface-2 text-destructive"><Trash2 className="size-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm grid place-items-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-border w-full max-w-lg shadow-soft">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold">{editing.id ? "Edit" : "New"} Product</h2>
              <button onClick={() => setEditing(null)}><X className="size-5" /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <Field label="Name"><input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" /></Field>
              <Field label="Description"><textarea value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none resize-none" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (cents)"><input type="number" value={editing.price_cents ?? 0} onChange={(e) => setEditing({ ...editing, price_cents: Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" /></Field>
                <Field label="Stock"><input type="number" value={editing.stock ?? ""} onChange={(e) => setEditing({ ...editing, stock: e.target.value === "" ? null : Number(e.target.value) })} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" /></Field>
              </div>
              <Field label="Category"><input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" /></Field>
              <Field label="Image URL"><input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-surface-2 text-sm">Cancel</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>{children}</div>;
}

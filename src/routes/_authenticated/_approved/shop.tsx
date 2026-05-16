import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ChannelColumn, type ChannelGroup } from "@/components/app/ChannelColumn";
import { ShoppingBag, Package, Settings, Plus, Minus, X, Send, Trash2, Pencil, Image as ImageIcon, Tag, CheckCircle2, BadgeCheck, Check, Wrench, FileText, BedDouble, Users, Loader2, Save, Star, Sparkles, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import shopHero from "@/assets/shop-hero.jpg";
import houseCutaway from "@/assets/house-cutaway.jpg";
import judgeCourtroom from "@/assets/judge-courtroom.jpg";
import refundPolicyHero from "@/assets/refund-policy-hero.jpg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/use-currency";
import { downloadReceipt } from "@/lib/receipt";
import { Download } from "lucide-react";

type View = "store" | "orders" | "admin" | "refund" | "multi_room" | "triple_room";

const POLICY_KEYS = ["refund", "multi_room", "triple_room"] as const;
type PolicyKey = typeof POLICY_KEYS[number];

export const Route = createFileRoute("/_authenticated/_approved/shop")({
  validateSearch: (s: Record<string, unknown>) => ({
    view: (
      s.view === "orders" || s.view === "admin" || s.view === "discounts" ||
      s.view === "refund" || s.view === "multi_room" || s.view === "triple_room"
        ? s.view
        : "store"
    ) as View | "discounts",
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: ShopPage,
});

interface Product {
  id: string; name: string; description: string | null; price_cents: number;
  image_url: string | null; category: string | null; stock: number | null;
  is_active: boolean; sort_order: number; is_recommended?: boolean;
}
type OrderStatus = "pending" | "processing" | "shipped" | "completed" | "cancelled";
interface Order {
  id: string; user_id: string; status: OrderStatus; total_cents: number;
  shipping_name: string | null; shipping_address: string | null; notes: string | null;
  created_at: string;
  email?: string | null;
  customer_type?: string | null;
  existing_username?: string | null;
  discount_code?: string | null;
  discount_cents?: number | null;
  paid_at?: string | null;
  completed_at?: string | null;
}
interface OrderItem { id: string; order_id: string; product_name: string; unit_price_cents: number; quantity: number; }
interface OrderMessage { id: string; order_id: string; sender_id: string; content: string; created_at: string; }
interface ProductCategory { id: string; name: string; slug: string; sort_order: number; }
interface DiscountCode { id: string; code: string; description: string | null; percent: number | null; amount_cents: number | null; user_id: string | null; is_active: boolean; }

let _currentFmt: (c: number) => string = (c: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((c || 0) / 100);
const fmt = (c: number) => _currentFmt(c);
let _currentSymbol = "£";

function ShopPage() {
  const { view, id } = Route.useSearch();
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const { format, symbol } = useCurrency();
  _currentFmt = format;
  _currentSymbol = symbol;
  const [username, setUsername] = useState<string | null>(null);
  useEffect(() => {
    if (!user) { setUsername(null); return; }
    let active = true;
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle().then(({ data }) => {
      if (active) setUsername((data as { username?: string | null } | null)?.username ?? null);
    });
    return () => { active = false; };
  }, [user]);

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
          <div className="pt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Policies</div>
          <SideBtn active={view === "refund"} onClick={() => navigate({ to: "/shop", search: { view: "refund" } })} Icon={FileText} label="Refund Policy" />
          <SideBtn active={view === "multi_room"} onClick={() => navigate({ to: "/shop", search: { view: "multi_room" } })} Icon={Users} label="Multi-room Rules" />
          <SideBtn active={view === "triple_room"} onClick={() => navigate({ to: "/shop", search: { view: "triple_room" } })} Icon={BedDouble} label="Triple-room Rules" />
          {isAdmin && (
            <>
              <div className="pt-3 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Admin</div>
              <SideBtn active={view === "admin"} onClick={() => navigate({ to: "/shop", search: { view: "admin" } })} Icon={Settings} label="Manage Products" />
              <SideBtn active={view === ("discounts" as View)} onClick={() => navigate({ to: "/shop", search: { view: "discounts" as never } })} Icon={Tag} label="Discount Codes" />
            </>
          )}
        </div>
        {user && (
          <div className="h-14 border-t border-border px-3 flex items-center gap-2 bg-rail">
            <div className="size-8 rounded-full bg-gradient-primary flex items-center justify-center text-xs font-semibold text-primary-foreground">
              {(username ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1"><div className="text-xs font-medium truncate">{username ?? "…"}</div></div>
          </div>
        )}
      </nav>
      {view === "store" && <Storefront />}
      {view === "orders" && <OrdersView selectedId={id} isAdmin={isAdmin} />}
      {view === "admin" && isAdmin && <AdminProducts />}
      {(view as string) === "discounts" && isAdmin && <AdminDiscounts />}
      {(view === "refund" || view === "multi_room" || view === "triple_room") && (
        view === "refund"
          ? <PolicyView policyKey="refund" isAdmin={isAdmin} />
          : <RoomPolicyView roomKey={view as "multi_room" | "triple_room"} isAdmin={isAdmin} />
      )}
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

// ============ POLICY VIEW ============
interface PolicyRow { key: string; title: string; body: string; updated_at: string; }

function PolicyView({ policyKey, isAdmin }: { policyKey: PolicyKey; isAdmin: boolean }) {
  const [row, setRow] = useState<PolicyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setEditing(false);
    supabase.from("shop_policies").select("*").eq("key", policyKey).maybeSingle().then(({ data }) => {
      if (cancel) return;
      const r = (data as PolicyRow | null) ?? { key: policyKey, title: defaultTitle(policyKey), body: "", updated_at: new Date().toISOString() };
      setRow(r);
      setDraft(r.body);
      setLoading(false);
    });
    return () => { cancel = true; };
  }, [policyKey]);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("shop_policies").upsert({
      key: policyKey,
      title: row?.title ?? defaultTitle(policyKey),
      body: draft,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setRow((r) => r ? { ...r, body: draft, updated_at: new Date().toISOString() } : r);
    setEditing(false);
    toast.success("Document saved");
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {policyKey === "refund" && (
          <section className="relative overflow-hidden rounded-3xl border border-border mb-8 shadow-soft">
            <img
              src={refundPolicyHero}
              alt="Customer with refund policy document"
              width={1920}
              height={1080}
              className="w-full h-56 md:h-72 lg:h-80 object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
              <div className="text-xs uppercase tracking-[0.25em] text-primary-foreground/80 mb-2">Store policies</div>
              <h1 className="font-display text-3xl md:text-4xl font-bold text-white drop-shadow">Refund Policy</h1>
              <p className="mt-2 text-sm md:text-base text-white/80 max-w-xl">
                Everything you need to know about returns, exchanges and getting your money back.
              </p>
            </div>
          </section>
        )}
        <header className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-2xl bg-gradient-primary grid place-items-center shadow-glow">
            <FileText className="size-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-bold">{row?.title ?? defaultTitle(policyKey)}</h1>
            {row?.updated_at && (
              <p className="text-xs text-muted-foreground">Last updated {new Date(row.updated_at).toLocaleString()}</p>
            )}
          </div>
          {isAdmin && !editing && (
            <button onClick={() => { setDraft(row?.body ?? ""); setEditing(true); }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-border text-sm hover:border-primary">
              <Pencil className="size-4" /> Edit
            </button>
          )}
        </header>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : editing ? (
          <div className="space-y-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={20}
              placeholder="Write the document content here. Plain text or Markdown."
              className="w-full px-4 py-3 rounded-xl bg-surface-1 border border-border text-sm font-mono leading-relaxed outline-none focus:border-primary"
            />
            <div className="flex gap-2">
              <button onClick={save} disabled={saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
              </button>
              <button onClick={() => { setEditing(false); setDraft(row?.body ?? ""); }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 border border-border text-sm">
                Cancel
              </button>
            </div>
          </div>
        ) : row && row.body.trim() ? (
          <article className="prose prose-invert max-w-none whitespace-pre-wrap text-sm leading-relaxed bg-surface-1 border border-border rounded-2xl p-6">
            {row.body}
          </article>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            No document yet.{isAdmin ? " Click Edit to add one." : " Please check back later."}
          </div>
        )}
      </div>
    </main>
  );
}

function defaultTitle(k: PolicyKey) {
  if (k === "refund") return "Refund Policy";
  if (k === "multi_room") return "Multi-room Usage Rules";
  return "Triple-room Usage Rules";
}

function StarRating({
  value, average, count, onRate, readOnly = false, size = "sm",
}: {
  value: number; average: number; count: number;
  onRate?: (v: number) => void; readOnly?: boolean; size?: "sm" | "md";
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value || Math.round(average);
  const px = size === "sm" ? "size-3.5" : "size-4";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            onMouseEnter={() => !readOnly && setHover(n)}
            onClick={(e) => { e.stopPropagation(); if (!readOnly) onRate?.(n); }}
            className={cn(
              "p-0.5 transition",
              readOnly ? "cursor-default" : "cursor-pointer hover:scale-110",
            )}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
          >
            <Star
              className={cn(
                px,
                n <= display ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      <span className="text-[11px] text-muted-foreground">
        {count > 0 ? `${average.toFixed(1)} (${count})` : "No ratings"}
      </span>
    </div>
  );
}

function ProductCard({
  p, qty, onAdd, onSub, onPlace, rating, average, ratingCount, onRate,
}: {
  p: Product; qty: number; onAdd: () => void; onSub: () => void;
  onPlace: () => void;
  rating: number; average: number; ratingCount: number;
  onRate: (v: number) => void;
}) {
  const fmt = _currentFmt;
  return (
    <div className="group bg-surface rounded-xl overflow-hidden border border-border hover:border-sky-400/50 hover:shadow-lg hover:shadow-blue-500/10 transition-all flex flex-col">
      <div className="aspect-square bg-surface-2 grid place-items-center overflow-hidden relative">
        {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" /> : <ImageIcon className="size-10 text-muted-foreground/40" />}
        {p.stock !== null && p.stock <= 0 && (
          <div className="absolute top-2 left-2 text-[10px] uppercase tracking-wider bg-red-500/90 text-white px-2 py-0.5 rounded">Out of stock</div>
        )}
        {p.is_recommended && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-white px-2 py-1 rounded-full shadow-lg shadow-orange-500/40 ring-1 ring-white/30">
            <Sparkles className="size-3" /> Recommended
          </div>
        )}
      </div>
      <div className="p-4 flex flex-col flex-1">
        {p.category && <div className="text-[10px] uppercase tracking-wider text-sky-300 mb-1">{p.category}</div>}
        <h3 className="font-semibold text-sm">{p.name}</h3>
        {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
        <div className="mt-2">
          <StarRating value={rating} average={average} count={ratingCount} onRate={onRate} />
        </div>
        <div className="mt-auto pt-3 flex items-center justify-between gap-2">
          <span className="font-display font-bold text-lg bg-gradient-to-r from-violet-600 to-blue-600 bg-clip-text text-transparent">{fmt(p.price_cents)}</span>
          {qty ? (
            <div className="flex items-center gap-1 bg-surface-2 rounded-lg">
              <button onClick={onSub} className="size-7 grid place-items-center hover:text-sky-400"><Minus className="size-3.5" /></button>
              <span className="text-sm font-medium w-5 text-center">{qty}</span>
              <button onClick={onAdd} className="size-7 grid place-items-center hover:text-sky-400"><Plus className="size-3.5" /></button>
            </div>
          ) : (
            <button onClick={onAdd} className="px-3 py-1.5 rounded-lg bg-surface-2 border border-border text-xs font-medium hover:border-sky-400/60">Add to order</button>
          )}
        </div>
        {qty > 0 && (
          <button onClick={onPlace} className="mt-2 w-full px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:opacity-90 shadow shadow-blue-500/20">
            Place Order
          </button>
        )}
      </div>
    </div>
  );
}

// ============ STOREFRONT ============
function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [dbCategories, setDbCategories] = useState<ProductCategory[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [tab, setTab] = useState<string>("welcome");
  const navigate = useNavigate();
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [ratings, setRatings] = useState<Record<string, { sum: number; count: number }>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});

  const reloadRatings = async () => {
    const { data } = await supabase.from("product_ratings").select("product_id,user_id,rating");
    const agg: Record<string, { sum: number; count: number }> = {};
    const mine: Record<string, number> = {};
    for (const r of (data ?? []) as { product_id: string; user_id: string; rating: number }[]) {
      const a = agg[r.product_id] ?? { sum: 0, count: 0 };
      a.sum += r.rating; a.count += 1;
      agg[r.product_id] = a;
      if (user && r.user_id === user.id) mine[r.product_id] = r.rating;
    }
    setRatings(agg); setMyRatings(mine);
  };

  const reloadCategories = () =>
    supabase.from("product_categories").select("*").order("sort_order").order("name")
      .then(({ data }) => setDbCategories((data ?? []) as ProductCategory[]));

  useEffect(() => {
    supabase.from("products").select("*").eq("is_active", true).order("sort_order").then(({ data }) => setProducts(data ?? []));
    reloadCategories();
    reloadRatings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const rateProduct = async (productId: string, value: number) => {
    if (!user) { toast.error("Please sign in"); return; }
    const prevAgg = ratings[productId];
    const prevMine = myRatings[productId] ?? 0;
    // Optimistic update
    const nextAgg = { sum: (prevAgg?.sum ?? 0) - prevMine + value, count: (prevAgg?.count ?? 0) + (prevMine ? 0 : 1) };
    setRatings({ ...ratings, [productId]: nextAgg });
    setMyRatings({ ...myRatings, [productId]: value });
    const { error } = await supabase
      .from("product_ratings")
      .upsert({ product_id: productId, user_id: user.id, rating: value } as never, { onConflict: "product_id,user_id" });
    if (error) { toast.error(error.message); reloadRatings(); return; }
    toast.success("Thanks for rating!");
  };

  // Merge DB-managed categories with any category strings present on products
  const categories = useMemo(() => {
    const fromDb = dbCategories.map((c) => c.name);
    const fromProducts = products.map((p) => p.category).filter(Boolean) as string[];
    const merged: string[] = [];
    for (const n of [...fromDb, ...fromProducts]) {
      if (n && !merged.includes(n)) merged.push(n);
    }
    return ["All", ...merged];
  }, [products, dbCategories]);
  const [cat, setCat] = useState("Single Account");
  const filtered = cat === "All" ? products : products.filter((p) => p.category === cat);

  // Group products by category for the "All" view (professional store layout)
  const grouped = useMemo(() => {
    const groups: { name: string; items: Product[] }[] = [];
    const order = categories.filter((c) => c !== "All");
    for (const name of order) {
      const items = products.filter((p) => p.category === name);
      if (items.length) groups.push({ name, items });
    }
    const uncategorized = products.filter((p) => !p.category);
    if (uncategorized.length) groups.push({ name: "Other", items: uncategorized });
    return groups;
  }, [products, categories]);

  const addCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const { error } = await supabase.from("product_categories").insert({ name, slug } as never);
    if (error) { toast.error(error.message); return; }
    setNewCatName(""); setAddingCat(false);
    toast.success("Category added");
    reloadCategories();
  };

  const cartItems = products.filter((p) => cart[p.id] > 0);
  const total = cartItems.reduce((s, p) => s + p.price_cents * cart[p.id], 0);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const sub = (id: string) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) - 1) }));

  const placeOrder = async (info: { name: string; email: string; customer_type: "new" | "existing"; existing_username: string; discount_code: string; discount_cents: number }) => {
    if (!user || cartItems.length === 0) return;
    const finalTotal = Math.max(0, total - (info.discount_cents || 0));
    const { data: order, error } = await supabase.from("orders").insert({
      user_id: user.id, total_cents: finalTotal, status: "pending",
      shipping_name: info.name,
      email: info.email,
      customer_type: info.customer_type,
      existing_username: info.customer_type === "existing" ? info.existing_username : null,
      discount_code: info.discount_code || null,
      discount_cents: info.discount_cents || 0,
    } as never).select().single();
    if (error || !order) { toast.error(error?.message ?? "Failed"); return; }
    const items = cartItems.map((p) => ({
      order_id: order.id, product_id: p.id, product_name: p.name,
      unit_price_cents: p.price_cents, quantity: cart[p.id],
    }));
    const { error: ie } = await supabase.from("order_items").insert(items as never);
    if (ie) { toast.error(ie.message); return; }
    setCart({}); setShowCheckout(false);
    toast.success("Order placed!");
    navigate({ to: "/shop", search: { view: "orders", id: order.id } });
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-6">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="bg-surface-2 border border-border flex flex-wrap h-auto">
              <TabsTrigger value="welcome" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Welcome</TabsTrigger>
              <TabsTrigger value="shop" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Shop</TabsTrigger>
              <TabsTrigger value="refund" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Refund Policy</TabsTrigger>
              <TabsTrigger value="multi_room" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Multi-room Rules</TabsTrigger>
              <TabsTrigger value="triple_room" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Triple-room Rules</TabsTrigger>
            </TabsList>

            <TabsContent value="welcome" className="mt-4">
              <section className="relative overflow-hidden border border-border rounded-2xl">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-blue-600" />
          <div className="relative grid md:grid-cols-2 gap-6 p-6 md:p-10 items-center">
            <div className="text-white">
              <div className="text-xs uppercase tracking-[0.2em] text-sky-200/80 mb-3">BM Support · Shop</div>
              <h1 className="font-display text-3xl md:text-5xl font-bold leading-tight">
                Welcome to the Store
              </h1>
              <p className="mt-4 text-sky-100/90 max-w-lg">
                Browse plans, gear and add-ons hand-picked for BM Support members.
                Place an order in seconds — we'll keep you posted every step of the way.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowCheckout(true)}
                  disabled={count === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium px-4 py-2.5 shadow-lg shadow-blue-500/30 disabled:opacity-50"
                >
                  <ShoppingBag className="size-4" />
                  View Cart
                  {count > 0 && (
                    <span className="ml-1 bg-white/20 px-1.5 rounded-full text-xs">{count}</span>
                  )}
                </button>
                        <button
                          onClick={() => setTab("shop")}
                          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 backdrop-blur px-4 py-2.5 text-sm text-white hover:bg-white/15 transition"
                        >
                          Shop now
                        </button>
              </div>
            </div>
            <div className="relative rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-2xl">
              <img
                src={shopHero}
                alt="BM Support Store"
                width={1280}
                height={640}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-tr from-blue-950/40 via-transparent to-transparent" />
            </div>
          </div>
        </section>
            </TabsContent>

            <TabsContent value="shop" className="mt-4">
              <div id="products" className="bg-background/80 backdrop-blur border border-border rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap mb-4 sticky top-0 z-10">
                {categories.map((c) => {
                  const count = c === "All" ? products.length : products.filter((p) => p.category === c).length;
                  return (
                    <button
                      key={c}
                      onClick={() => setCat(c)}
                      className={cn(
                        "text-xs px-3 py-1.5 rounded-full transition font-medium inline-flex items-center gap-1.5",
                        cat === c
                          ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow shadow-blue-500/30"
                          : "bg-surface-2 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {c}
                      <span className={cn("text-[10px] px-1.5 rounded-full", cat === c ? "bg-white/20" : "bg-background/60")}>{count}</span>
                    </button>
                  );
                })}
                {isAdmin && (
                  <div className="ml-auto flex items-center gap-2">
                    {addingCat ? (
                      <>
                        <input
                          autoFocus
                          value={newCatName}
                          onChange={(e) => setNewCatName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") addCategory(); if (e.key === "Escape") { setAddingCat(false); setNewCatName(""); } }}
                          placeholder="Category name"
                          className="text-xs bg-surface-2 border border-border rounded-md px-2 py-1.5 outline-none focus:border-sky-400"
                        />
                        <button onClick={addCategory} className="text-xs px-2.5 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium">Save</button>
                        <button onClick={() => { setAddingCat(false); setNewCatName(""); }} className="text-xs px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>
                      </>
                    ) : (
                      <button
                        onClick={() => setAddingCat(true)}
                        className="text-xs px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-sky-400/60"
                      >
                        <Plus className="size-3.5" /> Add category
                      </button>
                    )}
                  </div>
                )}
              </div>
              {products.length === 0 ? (
                <div className="text-center text-muted-foreground py-20">No products yet.</div>
              ) : cat === "All" ? (
                <div className="space-y-10">
                  {grouped.length === 0 ? (
                    <div className="text-center text-muted-foreground py-20">No products yet.</div>
                  ) : grouped.map((g) => (
                    <section key={g.name}>
                      <div className="flex items-end justify-between mb-4 pb-2 border-b border-border">
                        <div>
                          <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight">{g.name}</h2>
                          <p className="text-xs text-muted-foreground mt-0.5">{g.items.length} {g.items.length === 1 ? "product" : "products"}</p>
                        </div>
                        {g.name !== "Other" && (
                          <button onClick={() => setCat(g.name)} className="text-xs text-sky-400 hover:text-sky-300 font-medium">View all →</button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                        {g.items.map((p) => (
                          <ProductCard key={p.id} p={p} qty={cart[p.id] ?? 0} onAdd={() => add(p.id)} onSub={() => sub(p.id)} rating={myRatings[p.id] ?? 0} average={ratings[p.id] ? ratings[p.id].sum / ratings[p.id].count : 0} ratingCount={ratings[p.id]?.count ?? 0} onRate={(v) => rateProduct(p.id, v)} />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-muted-foreground py-20">No products in this category yet.</div>
              ) : (
                <section>
                  <div className="flex items-end justify-between mb-4 pb-2 border-b border-border">
                    <div>
                      <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight">{cat}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">{filtered.length} {filtered.length === 1 ? "product" : "products"}</p>
                    </div>
                    <button onClick={() => setCat("All")} className="text-xs text-sky-400 hover:text-sky-300 font-medium">← All categories</button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {filtered.map((p) => (
                      <ProductCard key={p.id} p={p} qty={cart[p.id] ?? 0} onAdd={() => add(p.id)} onSub={() => sub(p.id)} rating={myRatings[p.id] ?? 0} average={ratings[p.id] ? ratings[p.id].sum / ratings[p.id].count : 0} ratingCount={ratings[p.id]?.count ?? 0} onRate={(v) => rateProduct(p.id, v)} />
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="refund" className="mt-4"><InlinePolicy policyKey="refund" /></TabsContent>
            <TabsContent value="multi_room" className="mt-4"><InlinePolicy policyKey="multi_room" /></TabsContent>
            <TabsContent value="triple_room" className="mt-4"><InlinePolicy policyKey="triple_room" /></TabsContent>
          </Tabs>
        </div>
      </div>
      {showCheckout && <Checkout items={cartItems.map((p) => ({ ...p, qty: cart[p.id] }))} total={total} onClose={() => setShowCheckout(false)} onPlace={placeOrder} />}
    </main>
  );
}

function InlinePolicy({ policyKey }: { policyKey: PolicyKey }) {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  if (policyKey === "refund") return <PolicyView policyKey="refund" isAdmin={isAdmin} />;
  return <RoomPolicyView roomKey={policyKey} isAdmin={isAdmin} />;
}

// ============ ROOM POLICY VIEW (multi_room / triple_room) ============
function RoomPolicyView({ roomKey, isAdmin }: { roomKey: "multi_room" | "triple_room"; isAdmin: boolean }) {
  const rulesKey = roomKey;
  const punishmentKey = `${roomKey}_punishment`;
  const [rules, setRules] = useState<PolicyRow | null>(null);
  const [punishment, setPunishment] = useState<PolicyRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<null | "rules" | "punishment">(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const title = roomKey === "multi_room" ? "Multi-room Rules" : "Triple-room Rules";

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setEditing(null);
    supabase
      .from("shop_policies")
      .select("*")
      .in("key", [rulesKey, punishmentKey])
      .then(({ data }) => {
        if (cancel) return;
        const rows = (data ?? []) as PolicyRow[];
        const r = rows.find((x) => x.key === rulesKey) ?? { key: rulesKey, title: "Usage Rules", body: "", updated_at: new Date().toISOString() };
        const p = rows.find((x) => x.key === punishmentKey) ?? { key: punishmentKey, title: "Punishment", body: "", updated_at: new Date().toISOString() };
        setRules(r);
        setPunishment(p);
        setLoading(false);
      });
    return () => { cancel = true; };
  }, [rulesKey, punishmentKey]);

  const beginEdit = (which: "rules" | "punishment") => {
    setDraft((which === "rules" ? rules?.body : punishment?.body) ?? "");
    setEditing(which);
  };

  const save = async () => {
    if (!editing) return;
    const key = editing === "rules" ? rulesKey : punishmentKey;
    const existing = editing === "rules" ? rules : punishment;
    const fallbackTitle = editing === "rules" ? "Usage Rules" : "Punishment";
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("shop_policies").upsert({
      key,
      title: existing?.title ?? fallbackTitle,
      body: draft,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const updated = { ...(existing ?? { key, title: fallbackTitle }), body: draft, updated_at: new Date().toISOString() } as PolicyRow;
    if (editing === "rules") setRules(updated); else setPunishment(updated);
    setEditing(null);
    toast.success("Saved");
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Hero illustration */}
        <section className="relative overflow-hidden rounded-3xl border border-border mb-8 shadow-soft">
          <img
            src={houseCutaway}
            alt="Modern house cutaway"
            width={1920}
            height={1080}
            className="w-full h-56 md:h-72 lg:h-80 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
            <div className="text-xs uppercase tracking-[0.25em] text-primary-foreground/80 mb-2">House policies</div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-white drop-shadow">{title}</h1>
            <p className="mt-2 text-sm md:text-base text-white/80 max-w-xl">
              How shared rooms work in our community — and what happens when the rules are broken.
            </p>
          </div>
        </section>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Usage rules */}
            <PolicyCard
              tone="rules"
              title="Usage Rules"
              updatedAt={rules?.updated_at}
              body={rules?.body ?? ""}
              isAdmin={isAdmin}
              editing={editing === "rules"}
              draft={draft}
              setDraft={setDraft}
              onEdit={() => beginEdit("rules")}
              onCancel={() => setEditing(null)}
              onSave={save}
              saving={saving}
              disabled={editing !== null && editing !== "rules"}
            />

            {/* Punishment with judge bg */}
            <PolicyCard
              tone="punishment"
              title="Punishment"
              updatedAt={punishment?.updated_at}
              body={punishment?.body ?? ""}
              isAdmin={isAdmin}
              editing={editing === "punishment"}
              draft={draft}
              setDraft={setDraft}
              onEdit={() => beginEdit("punishment")}
              onCancel={() => setEditing(null)}
              onSave={save}
              saving={saving}
              disabled={editing !== null && editing !== "punishment"}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function PolicyCard({
  tone, title, updatedAt, body, isAdmin, editing, draft, setDraft,
  onEdit, onCancel, onSave, saving, disabled,
}: {
  tone: "rules" | "punishment";
  title: string;
  updatedAt?: string;
  body: string;
  isAdmin: boolean;
  editing: boolean;
  draft: string;
  setDraft: (s: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}) {
  const isPunishment = tone === "punishment";
  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border shadow-soft",
        isPunishment ? "text-white" : "bg-surface-1",
      )}
    >
      {isPunishment && (
        <>
          <img
            src={judgeCourtroom}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/90 via-slate-900/80 to-amber-950/70" />
        </>
      )}
      <div className="relative p-6 md:p-7">
        <header className="flex items-start gap-3 mb-4">
          <div className={cn(
            "size-10 rounded-xl grid place-items-center shrink-0",
            isPunishment ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/30" : "bg-gradient-primary text-primary-foreground shadow-glow",
          )}>
            <FileText className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className={cn("font-display text-xl font-bold", isPunishment ? "text-white" : "")}>{title}</h2>
            {updatedAt && (
              <p className={cn("text-xs", isPunishment ? "text-white/60" : "text-muted-foreground")}>
                Updated {new Date(updatedAt).toLocaleDateString()}
              </p>
            )}
          </div>
          {isAdmin && !editing && (
            <button
              onClick={onEdit}
              disabled={disabled}
              className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-40",
                isPunishment
                  ? "bg-white/10 border-white/20 text-white hover:bg-white/20"
                  : "bg-surface-2 border-border hover:border-primary",
              )}
            >
              <Pencil className="size-3.5" /> Edit
            </button>
          )}
        </header>

        {editing ? (
          <div className="space-y-3">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              placeholder="Write the content here. Plain text or Markdown."
              className={cn(
                "w-full px-4 py-3 rounded-xl text-sm font-mono leading-relaxed outline-none border",
                isPunishment
                  ? "bg-black/40 border-white/20 text-white placeholder:text-white/40 focus:border-amber-400"
                  : "bg-surface-1 border-border focus:border-primary",
              )}
            />
            <div className="flex gap-2">
              <button
                onClick={onSave}
                disabled={saving}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60",
                  isPunishment ? "bg-amber-500 text-amber-950 hover:bg-amber-400" : "bg-primary text-primary-foreground",
                )}
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
              </button>
              <button
                onClick={onCancel}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border",
                  isPunishment ? "bg-white/5 border-white/20 text-white" : "bg-surface-2 border-border",
                )}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : body.trim() ? (
          <div
            className={cn(
              "whitespace-pre-wrap text-sm leading-relaxed",
              isPunishment ? "text-white/90" : "text-foreground",
            )}
          >
            {body}
          </div>
        ) : (
          <div
            className={cn(
              "rounded-xl border border-dashed p-8 text-center text-sm",
              isPunishment ? "border-white/20 text-white/60" : "border-border text-muted-foreground",
            )}
          >
            No content yet.{isAdmin ? " Click Edit to add some." : ""}
          </div>
        )}
      </div>
    </article>
  );
}

function Checkout({ items, total, onClose, onPlace }: {
  items: (Product & { qty: number })[]; total: number; onClose: () => void;
  onPlace: (s: { name: string; email: string; customer_type: "new" | "existing"; existing_username: string; discount_code: string; discount_cents: number }) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [customerType, setCustomerType] = useState<"new" | "existing">("new");
  const [existingUsername, setExistingUsername] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null);
  const [applying, setApplying] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseQuery, setBrowseQuery] = useState("");
  const [available, setAvailable] = useState<DiscountCode[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  const openBrowse = async () => {
    setBrowseOpen(true);
    setLoadingAvailable(true);
    const { data } = await supabase
      .from("discount_codes")
      .select("*")
      .eq("is_active", true)
      .order("code", { ascending: true });
    setAvailable((data ?? []) as DiscountCode[]);
    setLoadingAvailable(false);
  };

  const filteredAvailable = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) =>
      c.code.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)
    );
  }, [available, browseQuery]);

  const previewValue = (c: DiscountCode) => {
    if (c.amount_cents) return `-${fmt(Math.min(total, c.amount_cents))}`;
    if (c.percent) return `-${c.percent}%`;
    return "";
  };

  const selectCode = (c: DiscountCode) => {
    if (appliedCode) {
      toast.error("Only 1 discount code per order. Remove the current code first.");
      return;
    }
    setAppliedCode(c);
    setDiscountInput(c.code);
    setBrowseOpen(false);
    toast.success(`Code "${c.code}" applied`);
  };

  const discountCents = useMemo(() => {
    if (!appliedCode) return 0;
    if (appliedCode.amount_cents) return Math.min(total, appliedCode.amount_cents);
    if (appliedCode.percent) return Math.round(total * (appliedCode.percent / 100));
    return 0;
  }, [appliedCode, total]);
  const finalTotal = Math.max(0, total - discountCents);

  const applyCode = async () => {
    const code = discountInput.trim();
    if (!code) return;
    if (appliedCode && appliedCode.code.toLowerCase() !== code.toLowerCase()) {
      toast.error("Only 1 discount code per order. Remove the current code first.");
      return;
    }
    if (appliedCode && appliedCode.code.toLowerCase() === code.toLowerCase()) {
      toast.info("This code is already applied");
      return;
    }
    setApplying(true);
    const { data, error } = await supabase.from("discount_codes").select("*")
      .ilike("code", code).eq("is_active", true).maybeSingle();
    setApplying(false);
    if (error || !data) { toast.error("Invalid code"); return; }
    setAppliedCode(data as DiscountCode);
    toast.success(`Code "${(data as DiscountCode).code}" applied`);
  };

  const canSubmit = !!name && !!email && (customerType === "new" || !!existingUsername.trim());

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
            <div className="flex justify-between pt-2 border-t border-border text-sm">
              <span className="text-muted-foreground">Subtotal</span><span>{fmt(total)}</span>
            </div>
            {discountCents > 0 && (
              <div className="flex justify-between text-sm text-success">
                <span>Discount {appliedCode?.code ? `(${appliedCode.code})` : ""}</span><span>-{fmt(discountCents)}</span>
              </div>
            )}
            <div className="flex justify-between font-display font-bold">
              <span>Total</span><span>{fmt(finalTotal)}</span>
            </div>
          </div>
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none" />
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Customer</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCustomerType("new")}
                  className={cn("flex-1 px-3 py-2 rounded-lg text-sm border", customerType === "new" ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border")}>
                  New customer
                </button>
                <button type="button" onClick={() => setCustomerType("existing")}
                  className={cn("flex-1 px-3 py-2 rounded-lg text-sm border", customerType === "existing" ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border")}>
                  Existing customer
                </button>
              </div>
            </div>
            {customerType === "existing" && (
              <input value={existingUsername} onChange={(e) => setExistingUsername(e.target.value)} placeholder="Username you're extending" className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none" />
            )}
            <div className="space-y-2">
              <div className="flex gap-2">
                <input value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} placeholder="Discount code (optional)" className="flex-1 px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none" />
                <button type="button" onClick={applyCode} disabled={applying || !discountInput.trim()}
                  className="px-3 py-2 rounded-lg bg-surface-2 text-sm font-medium border border-border disabled:opacity-50">
                  {appliedCode ? "Re-apply" : "Apply"}
                </button>
                <button type="button" onClick={openBrowse}
                  className="px-3 py-2 rounded-lg bg-surface-2 text-sm font-medium border border-border inline-flex items-center gap-1">
                  <Tag className="size-4" /> Browse
                </button>
              </div>
              {appliedCode && (
                <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-success/10 text-success">
                  <span>Applied: <span className="font-mono font-semibold">{appliedCode.code}</span> — only 1 code per order</span>
                  <button type="button" onClick={() => { setAppliedCode(null); setDiscountInput(""); }} className="underline hover:no-underline">Remove</button>
                </div>
              )}
              {browseOpen && (
                <div className="rounded-lg border border-border bg-surface-2 p-2 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      autoFocus
                      value={browseQuery}
                      onChange={(e) => setBrowseQuery(e.target.value)}
                      placeholder="Search valid codes..."
                      className="flex-1 px-3 py-1.5 rounded-md bg-surface text-sm border border-border focus:border-primary outline-none"
                    />
                    <button type="button" onClick={() => setBrowseOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
                  </div>
                  <div className="max-h-48 overflow-y-auto divide-y divide-border rounded-md">
                    {loadingAvailable ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">Loading…</div>
                    ) : filteredAvailable.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground text-center">No matching codes</div>
                    ) : (
                      filteredAvailable.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => selectCode(c)}
                          className="w-full text-left p-2 hover:bg-surface flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-mono text-sm font-semibold">{c.code}</div>
                            {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
                          </div>
                          <div className="text-xs font-semibold text-success shrink-0">{previewValue(c)}</div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-border flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-surface-2 text-sm">Cancel</button>
          <button onClick={() => onPlace({ name, email, customer_type: customerType, existing_username: existingUsername, discount_code: appliedCode?.code ?? "", discount_cents: discountCents })}
            disabled={!canSubmit} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">Place Order</button>
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
    setOrders((data ?? []) as Order[]);
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

  const sendSystem = async (content: string) => {
    if (!user) return;
    await supabase.from("order_messages").insert({ order_id: orderId, sender_id: user.id, content });
  };

  const acceptOrder = async () => {
    if (!order || order.status !== "pending") return;
    const { error } = await supabase.from("orders").update({ status: "processing" } as never).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    await sendSystem(`✅ Order accepted — thank you for your order!`);
    toast.success("Order accepted");
  };

  const markPaid = async () => {
    if (!order || order.paid_at) return;
    const { error } = await supabase.from("orders").update({
      paid_at: new Date().toISOString(), paid_by: user?.id ?? null, status: "processing",
    } as never).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    await sendSystem(`💳 Payment received — thank you for your payment!`);
    toast.success("Marked as paid");
  };

  const settingUpAccount = async () => {
    if (!order) return;
    await sendSystem(`🛠️ We are currently setting up your account details and will share these next.`);
    toast.success("Customer notified");
  };

  const completeSale = async () => {
    if (!order) return;
    const { error } = await supabase.from("orders").update({
      completed_at: new Date().toISOString(), completed_by: user?.id ?? null, status: "completed",
    } as never).eq("id", orderId);
    if (error) { toast.error(error.message); return; }
    await sendSystem(`🎉 Order complete — thank you for your business!`);
    toast.success("Sale completed");
  };

  const handleDownload = async () => {
    if (!order) return;
    try {
      await downloadReceipt(order, items);
    } catch (e) {
      toast.error((e as Error).message || "Could not generate PDF");
    }
  };

  if (!order) return <main className="flex-1 grid place-items-center text-muted-foreground text-sm">Loading…</main>;

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <header className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0">
        <div>
          <div className="font-display font-bold text-sm">Order #{order.id.slice(0, 8)}</div>
          <div className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleString()}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={handleDownload}
            className="px-2.5 py-1 rounded-md bg-surface-2 text-xs font-medium flex items-center gap-1 hover:bg-surface-2/80">
            <Download className="size-3.5" /> {order.paid_at ? "Receipt" : "Invoice"} PDF
          </button>
          {isAdmin ? (
            <>
              <button onClick={acceptOrder} disabled={order.status !== "pending"}
                className="px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-500 text-xs font-medium flex items-center gap-1 hover:bg-amber-500/25 disabled:opacity-50">
                <Check className="size-3.5" /> {order.status === "pending" ? "Accept Order" : "Accepted"}
              </button>
              <button onClick={markPaid} disabled={!!order.paid_at}
                className="px-2.5 py-1 rounded-md bg-success/15 text-success text-xs font-medium flex items-center gap-1 hover:bg-success/25 disabled:opacity-50">
                <BadgeCheck className="size-3.5" /> {order.paid_at ? "Paid" : "Mark As Paid"}
              </button>
              <button onClick={settingUpAccount}
                className="px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-500 text-xs font-medium flex items-center gap-1 hover:bg-blue-500/25">
                <Wrench className="size-3.5" /> Setting Up Account
              </button>
              <button onClick={completeSale} disabled={!!order.completed_at}
                className="px-2.5 py-1 rounded-md bg-primary/15 text-primary text-xs font-medium flex items-center gap-1 hover:bg-primary/25 disabled:opacity-50">
                <CheckCircle2 className="size-3.5" /> {order.completed_at ? "Completed" : "Sale Complete"}
              </button>
            </>
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
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Customer</div>
            {order.shipping_name && <div>{order.shipping_name}</div>}
            {order.email && <div className="text-muted-foreground text-xs">{order.email}</div>}
            {order.customer_type && (
              <div className="text-xs mt-1">
                <span className="text-muted-foreground">Type: </span>
                <span className="capitalize">{order.customer_type}</span>
                {order.customer_type === "existing" && order.existing_username && (
                  <span className="text-muted-foreground"> · extending @{order.existing_username}</span>
                )}
              </div>
            )}
            {order.discount_code && (
              <div className="text-xs mt-1 text-muted-foreground">Discount: {order.discount_code} (-{fmt(order.discount_cents ?? 0)})</div>
            )}
            {order.paid_at && <div className="text-xs mt-1 text-success">Paid · {new Date(order.paid_at).toLocaleString()}</div>}
            {order.completed_at && <div className="text-xs text-primary">Completed · {new Date(order.completed_at).toLocaleString()}</div>}
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
  const [priceText, setPriceText] = useState("");
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [showCats, setShowCats] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const sym = _currentSymbol;

  const load = async () => {
    const { data } = await supabase.from("products").select("*").order("sort_order");
    setProducts(data ?? []);
  };
  const loadCats = async () => {
    const { data } = await supabase.from("product_categories").select("*").order("sort_order").order("name");
    setCategories((data ?? []) as ProductCategory[]);
  };
  useEffect(() => { load(); loadCats(); }, []);

  useEffect(() => {
    if (editing) setPriceText(editing.price_cents != null ? (editing.price_cents / 100).toFixed(2) : "");
  }, [editing?.id, editing == null]);

  const addCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const { error } = await supabase.from("product_categories").insert({ name, slug });
    if (error) { toast.error(error.message); return; }
    setNewCat(""); loadCats();
  };
  const removeCategory = async (id: string) => {
    if (!confirm("Delete this category?")) return;
    const { error } = await supabase.from("product_categories").delete().eq("id", id);
    if (error) toast.error(error.message); else loadCats();
  };

  const save = async () => {
    if (!editing?.name) return;
    const parsed = parseFloat(priceText.replace(/[^0-9.]/g, ""));
    const price_cents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
    const payload = {
      name: editing.name, description: editing.description ?? null,
      price_cents, image_url: editing.image_url ?? null,
      category: editing.category ?? null, stock: editing.stock ?? null,
      is_active: editing.is_active ?? true, sort_order: editing.sort_order ?? 0,
      is_recommended: editing.is_recommended ?? false,
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

  const toggleRecommended = async (p: Product) => {
    const next = !p.is_recommended;
    setProducts((arr) => arr.map((x) => x.id === p.id ? { ...x, is_recommended: next } : x));
    const { error } = await supabase.from("products").update({ is_recommended: next }).eq("id", p.id);
    if (error) { toast.error(error.message); load(); }
  };

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return; }
    const from = products.findIndex((p) => p.id === dragId);
    const to = products.findIndex((p) => p.id === targetId);
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return; }
    const next = [...products];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    const reordered = next.map((p, i) => ({ ...p, sort_order: i }));
    setProducts(reordered);
    setDragId(null); setOverId(null);
    // Persist new sort_order for every product
    const updates = reordered.map((p) =>
      supabase.from("products").update({ sort_order: p.sort_order }).eq("id", p.id),
    );
    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) { toast.error(failed.error.message); load(); }
    else toast.success("Order updated");
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <header className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0">
        <h1 className="font-display font-bold text-lg">Manage Products</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCats(true)}
            className="px-3 py-1.5 rounded-lg bg-surface-2 text-sm font-medium flex items-center gap-1 hover:bg-surface-2/80">
            <Settings className="size-4" /> Categories
          </button>
          <button onClick={() => setEditing({ is_active: true, price_cents: 0, sort_order: 0 })}
            className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1">
            <Plus className="size-4" /> New Product
          </button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <CurrencySettingsCard />
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted-foreground text-xs">
              <tr>
                <th className="w-8 p-3"></th>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Category</th>
                <th className="text-right p-3">Price</th>
                <th className="text-right p-3">Stock</th>
                <th className="text-center p-3">Active</th>
                <th className="text-center p-3">Recommended</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No products. Click "New Product" to add one.</td></tr>}
              {products.map((p) => (
                <tr
                  key={p.id}
                  draggable
                  onDragStart={() => setDragId(p.id)}
                  onDragOver={(e) => { e.preventDefault(); setOverId(p.id); }}
                  onDragLeave={() => setOverId((o) => (o === p.id ? null : o))}
                  onDrop={(e) => { e.preventDefault(); handleDrop(p.id); }}
                  onDragEnd={() => { setDragId(null); setOverId(null); }}
                  className={cn(
                    "border-t border-border transition",
                    dragId === p.id && "opacity-50",
                    overId === p.id && dragId && dragId !== p.id && "bg-primary/10",
                  )}
                >
                  <td className="p-3 text-muted-foreground cursor-grab active:cursor-grabbing"><GripVertical className="size-4" /></td>
                  <td className="p-3 font-medium">{p.name}</td>
                  <td className="p-3 text-muted-foreground">{p.category ?? "—"}</td>
                  <td className="p-3 text-right">{fmt(p.price_cents)}</td>
                  <td className="p-3 text-right">{p.stock ?? "—"}</td>
                  <td className="p-3 text-center">{p.is_active ? "✓" : "—"}</td>
                  <td className="p-3 text-center">
                    <button
                      onClick={() => toggleRecommended(p)}
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition",
                        p.is_recommended
                          ? "bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow shadow-orange-500/30"
                          : "bg-surface-2 text-muted-foreground hover:text-foreground",
                      )}
                      title={p.is_recommended ? "Recommended — click to remove" : "Mark as recommended"}
                    >
                      <Sparkles className="size-3" />
                      {p.is_recommended ? "Recommended" : "Mark"}
                    </button>
                  </td>
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
                <Field label={`Price (${sym})`}>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={priceText}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) setPriceText(v);
                      }}
                      className="w-full pl-7 pr-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none"
                    />
                  </div>
                </Field>
                <Field label="Stock">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="—"
                    value={editing.stock ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "") setEditing({ ...editing, stock: null });
                      else if (/^\d+$/.test(v)) setEditing({ ...editing, stock: Number(v) });
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none"
                  />
                </Field>
              </div>
              <Field label="Category">
                <select
                  value={editing.category ?? ""}
                  onChange={(e) => setEditing({ ...editing, category: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none"
                >
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    No categories yet. <button type="button" onClick={() => setShowCats(true)} className="underline hover:text-foreground">Add one</button>.
                  </div>
                )}
              </Field>
              <Field label="Image URL"><input value={editing.image_url ?? ""} onChange={(e) => setEditing({ ...editing, image_url: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active</label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_recommended ?? false} onChange={(e) => setEditing({ ...editing, is_recommended: e.target.checked })} />
                <Sparkles className="size-3.5 text-amber-400" /> Recommended (shows sticker on storefront)
              </label>
            </div>
            <div className="p-5 border-t border-border flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-lg bg-surface-2 text-sm">Cancel</button>
              <button onClick={save} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">Save</button>
            </div>
          </div>
        </div>
      )}
      {showCats && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm grid place-items-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-border w-full max-w-md shadow-soft">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold">Product Categories</h2>
              <button onClick={() => setShowCats(false)}><X className="size-5" /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="flex gap-2">
                <input
                  value={newCat}
                  onChange={(e) => setNewCat(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCategory()}
                  placeholder="New category name"
                  className="flex-1 px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none"
                />
                <button onClick={addCategory} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1">
                  <Plus className="size-4" /> Add
                </button>
              </div>
              <div className="space-y-1">
                {categories.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-4">No categories yet.</div>
                )}
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-2">
                    <div>
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.slug}</div>
                    </div>
                    <button onClick={() => removeCategory(c.id)} className="p-1.5 rounded hover:bg-background text-destructive">
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-5 border-t border-border flex justify-end">
              <button onClick={() => setShowCats(false)} className="px-4 py-2 rounded-lg bg-surface-2 text-sm">Done</button>
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

const CURRENCY_PRESETS: { code: string; symbol: string; locale: string; label: string }[] = [
  { code: "GBP", symbol: "£", locale: "en-GB", label: "British Pound (£)" },
  { code: "USD", symbol: "$", locale: "en-US", label: "US Dollar ($)" },
  { code: "EUR", symbol: "€", locale: "en-IE", label: "Euro (€)" },
  { code: "CAD", symbol: "$", locale: "en-CA", label: "Canadian Dollar ($)" },
  { code: "AUD", symbol: "$", locale: "en-AU", label: "Australian Dollar ($)" },
  { code: "JPY", symbol: "¥", locale: "ja-JP", label: "Japanese Yen (¥)" },
  { code: "INR", symbol: "₹", locale: "en-IN", label: "Indian Rupee (₹)" },
  { code: "CHF", symbol: "CHF", locale: "de-CH", label: "Swiss Franc (CHF)" },
];

function CurrencySettingsCard() {
  const { currency } = useCurrency();
  const [saving, setSaving] = useState(false);
  const matchIdx = CURRENCY_PRESETS.findIndex((p) => p.code === currency.code);
  const [selected, setSelected] = useState<string>(matchIdx >= 0 ? currency.code : "CUSTOM");
  const [customSymbol, setCustomSymbol] = useState(currency.symbol);
  const [customCode, setCustomCode] = useState(currency.code);

  useEffect(() => {
    const i = CURRENCY_PRESETS.findIndex((p) => p.code === currency.code);
    setSelected(i >= 0 ? currency.code : "CUSTOM");
    setCustomSymbol(currency.symbol);
    setCustomCode(currency.code);
  }, [currency.code, currency.symbol]);

  const save = async () => {
    let value: { code: string; symbol: string; locale: string };
    if (selected === "CUSTOM") {
      const code = customCode.trim().toUpperCase() || "GBP";
      const symbol = customSymbol.trim() || code;
      value = { code, symbol, locale: "en-GB" };
    } else {
      const p = CURRENCY_PRESETS.find((x) => x.code === selected)!;
      value = { code: p.code, symbol: p.symbol, locale: p.locale };
    }
    setSaving(true);
    const { error } = await supabase
      .from("app_settings")
      .upsert({ key: "currency", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Currency updated");
  };

  return (
    <div className="mb-6 bg-surface rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-display font-semibold text-sm">Store Currency</h3>
          <p className="text-xs text-muted-foreground">Applied across the storefront, checkout, orders and notifications.</p>
        </div>
        <div className="text-xs text-muted-foreground">Current: <span className="font-semibold text-foreground">{currency.symbol} {currency.code}</span></div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground mb-1 block">Currency</span>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none min-w-[220px]"
          >
            {CURRENCY_PRESETS.map((p) => (
              <option key={p.code} value={p.code}>{p.label}</option>
            ))}
            <option value="CUSTOM">Custom…</option>
          </select>
        </label>
        {selected === "CUSTOM" && (
          <>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">ISO code</span>
              <input
                value={customCode}
                onChange={(e) => setCustomCode(e.target.value)}
                maxLength={6}
                className="w-24 px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none uppercase"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Symbol</span>
              <input
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                maxLength={4}
                className="w-20 px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none"
              />
            </label>
          </>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1 disabled:opacity-60"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </button>
      </div>
    </div>
  );
}

// ============ ADMIN: DISCOUNT CODES ============
function AdminDiscounts() {
  const [codes, setCodes] = useState<DiscountCode[]>([]);
  const [users, setUsers] = useState<{ id: string; username: string | null; display_name: string | null }[]>([]);
  const [editing, setEditing] = useState<Partial<DiscountCode> | null>(null);
  const [percentInput, setPercentInput] = useState("");
  const [amountInput, setAmountInput] = useState("");

  useEffect(() => {
    if (editing) {
      setPercentInput(editing.percent != null ? String(editing.percent) : "");
      setAmountInput(editing.amount_cents != null ? (editing.amount_cents / 100).toFixed(2) : "");
    } else {
      setPercentInput("");
      setAmountInput("");
    }
  }, [editing?.id, editing]);

  const load = async () => {
    const { data } = await supabase.from("discount_codes").select("*").order("created_at", { ascending: false });
    setCodes((data ?? []) as DiscountCode[]);
  };
  useEffect(() => {
    load();
    supabase.from("profiles").select("id,username,display_name").order("username").then(({ data }) => setUsers(data ?? []));
  }, []);

  const save = async () => {
    if (!editing?.code) { toast.error("Code required"); return; }
    const percentNum = percentInput.trim() === "" ? null : Math.max(0, Math.min(100, Math.floor(Number(percentInput))));
    const amountNum = amountInput.trim() === "" ? null : Math.max(0, Math.round(parseFloat(amountInput) * 100));
    if (percentNum != null && amountNum != null) { toast.error("Use either a percent or amount, not both"); return; }
    if (percentNum == null && amountNum == null) { toast.error("Enter a percent or amount off"); return; }
    const payload = {
      code: editing.code.trim().toUpperCase(),
      description: editing.description ?? null,
      percent: percentNum,
      amount_cents: amountNum,
      user_id: editing.user_id ?? null,
      is_active: editing.is_active ?? true,
    };
    const { error } = editing.id
      ? await supabase.from("discount_codes").update(payload).eq("id", editing.id)
      : await supabase.from("discount_codes").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved"); setEditing(null); load();
  };
  const remove = async (id: string) => {
    if (!confirm("Delete this code?")) return;
    const { error } = await supabase.from("discount_codes").delete().eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <header className="h-14 px-6 border-b border-border flex items-center justify-between shrink-0">
        <h1 className="font-display font-bold text-lg">Discount Codes</h1>
        <button onClick={() => setEditing({ is_active: true })}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-1">
          <Plus className="size-4" /> New Code
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="bg-surface rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-muted-foreground text-xs">
              <tr>
                <th className="text-left p-3">Code</th>
                <th className="text-left p-3">Discount</th>
                <th className="text-left p-3">Scope</th>
                <th className="text-left p-3">Description</th>
                <th className="text-center p-3">Active</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {codes.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No discount codes yet.</td></tr>}
              {codes.map((c) => {
                const u = c.user_id ? users.find((x) => x.id === c.user_id) : null;
                return (
                  <tr key={c.id} className="border-t border-border">
                    <td className="p-3 font-mono font-semibold">{c.code}</td>
                    <td className="p-3">{c.percent ? `${c.percent}%` : c.amount_cents ? fmt(c.amount_cents) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{u ? `@${u.username ?? u.display_name ?? "user"}` : "Everyone"}</td>
                    <td className="p-3 text-muted-foreground">{c.description ?? "—"}</td>
                    <td className="p-3 text-center">{c.is_active ? "✓" : "—"}</td>
                    <td className="p-3 text-right">
                      <button onClick={() => setEditing(c)} className="p-1.5 rounded hover:bg-surface-2"><Pencil className="size-3.5" /></button>
                      <button onClick={() => remove(c.id)} className="p-1.5 rounded hover:bg-surface-2 text-destructive"><Trash2 className="size-3.5" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {editing && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm grid place-items-center z-50 p-4">
          <div className="bg-surface rounded-2xl border border-border w-full max-w-lg shadow-soft">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-bold">{editing.id ? "Edit" : "New"} Discount Code</h2>
              <button onClick={() => setEditing(null)}><X className="size-5" /></button>
            </div>
            <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              <Field label="Code">
                <input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="SUMMER10" className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none uppercase" />
              </Field>
              <Field label="Description"><input value={editing.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Percent off">
                  <input type="text" inputMode="numeric" placeholder="e.g. 10" value={percentInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d{1,3}$/.test(v)) {
                        setPercentInput(v);
                        if (v !== "") setAmountInput("");
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" />
                </Field>
                <Field label="Amount off (£)">
                  <input type="text" inputMode="decimal" placeholder="e.g. 5.00"
                    value={amountInput}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^\d*\.?\d{0,2}$/.test(v)) {
                        setAmountInput(v);
                        if (v !== "") setPercentInput("");
                      }
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none" />
                </Field>
              </div>
              <Field label="Customer (leave blank for everyone)">
                <select value={editing.user_id ?? ""} onChange={(e) => setEditing({ ...editing, user_id: e.target.value || null })}
                  className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none">
                  <option value="">Everyone (global)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.username ?? u.display_name ?? u.id.slice(0, 8)}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={editing.is_active ?? true} onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Active
              </label>
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

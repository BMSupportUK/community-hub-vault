import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { type ChannelGroup } from "@/components/app/ChannelColumn";
import { ShoppingBag, Package, Settings, Plus, Minus, X, Send, Trash2, Pencil, Image as ImageIcon, Tag, CheckCircle2, BadgeCheck, Check, Wrench, FileText, BedDouble, Users, Loader2, Save, Star, Sparkles, GripVertical, Receipt, UserCog, ArrowRight, ArrowLeft } from "lucide-react";
import { Monitor, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import shopHero from "@/assets/shop-hero.jpg";
import shopOrdersBg from "@/assets/shop-orders-bg.jpg";
import houseCutaway from "@/assets/house-cutaway.jpg";
import judgeCourtroom from "@/assets/judge-courtroom.jpg";
import refundPolicyHero from "@/assets/refund-policy-hero.jpg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCurrency } from "@/hooks/use-currency";
import { downloadReceipt } from "@/lib/receipt";
import { Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chargeOrderWithSquare, getSquareWebConfig } from "@/lib/square-payments.functions";
import { capturePaypalOrder, createPaypalOrder, getPaypalWebConfig } from "@/lib/paypal-payments.functions";
import { createCryptoInvoice, getCryptoConfig, getCryptoInvoiceStatus } from "@/lib/nowpayments.functions";
import { CreditCard, Ban } from "lucide-react";
import { getOutOfHoursMessage } from "@/lib/business-hours";
import { isAdminUnlocked } from "@/lib/admin-unlock";
import { useRouter } from "@tanstack/react-router";

type View = "store" | "orders" | "admin" | "refund" | "multi_room" | "triple_room";

function linkify(text: string): React.ReactNode[] {
  const re = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const url = m[0];
    parts.push(<MessageLink key={i++} url={url} />);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function MessageLink({ url }: { url: string }) {
  const router = useRouter();
  const isSameOrigin = typeof window !== "undefined" && url.startsWith(window.location.origin);
  if (!isSameOrigin) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="underline break-all">
        {url}
      </a>
    );
  }
  const internal = url.slice(window.location.origin.length) || "/";
  return (
    <a
      href={internal}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        router.navigate({ to: internal });
      }}
      className="underline break-all"
    >
      {url}
    </a>
  );
}

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
    scope: s.scope === "all" ? "all" : undefined,
  }),
  component: ShopPage,
});

interface Product {
  id: string; name: string; description: string | null; price_cents: number;
  image_url: string | null; category: string | null; stock: number | null;
  is_active: boolean; sort_order: number; is_recommended?: boolean;
}
type OrderStatus = "pending" | "processing" | "paid" | "completed" | "cancelled";
interface Order {
  id: string; user_id: string; status: OrderStatus; total_cents: number;
  shipping_name: string | null; notes: string | null;
  created_at: string;
  email?: string | null;
  customer_type?: string | null;
  existing_username?: string | null;
  discount_code?: string | null;
  discount_cents?: number | null;
  paid_at?: string | null;
  completed_at?: string | null;
  wants_adult_content?: boolean | null;
}
interface OrderItem { id: string; order_id: string; product_name: string; unit_price_cents: number; quantity: number; }
interface OrderMessage { id: string; order_id: string; sender_id: string; content: string; created_at: string; }
interface ProductCategory { id: string; name: string; slug: string; sort_order: number; }
interface DiscountCode { id: string; code: string; description: string | null; percent: number | null; amount_cents: number | null; user_id: string | null; is_active: boolean; }
interface DiscountCodeWithProducts extends DiscountCode { product_ids?: string[] }

let _currentFmt: (c: number) => string = (c: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format((c || 0) / 100);
const fmt = (c: number) => _currentFmt(c);
let _currentSymbol = "£";

function ShopPage() {
  const { view, id, scope } = Route.useSearch();
  const navigate = useNavigate();
  const { user, hasAny, hasRole } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  // Product & discount management is restricted to admin only (not management).
  const isAdminOnly = hasRole("admin");
  const adminUnlocked = isAdmin && isAdminUnlocked(user?.id);
  const isAdminView =
    (view === "admin" && isAdminOnly) ||
    ((view as string) === "discounts" && isAdminOnly) ||
    (view === "orders" && scope === "all");

  useEffect(() => {
    if (isAdminView && isAdmin && !adminUnlocked) {
      navigate({ to: "/admin", search: { next: view === "orders" ? "/shop?view=orders&scope=all" : "/shop" } });
    }
  }, [isAdminView, isAdmin, adminUnlocked, navigate]);
  const { format, symbol } = useCurrency();
  _currentFmt = format;
  _currentSymbol = symbol;
  const go = (next: Partial<{ view: View | "discounts"; id: string; scope: string }>) =>
    navigate({ to: "/shop", search: next as never });

  const groups: ChannelGroup[] = [
    {
      label: "Shop",
      items: [
        { to: "/shop", label: "Storefront", icon: ShoppingBag, active: view === "store", onClick: () => go({ view: "store" }) },
        { to: "/shop", label: "My Orders", icon: Package, active: view === "orders" && scope !== "all", onClick: () => go({ view: "orders" }) },
      ],
    },
    {
      label: "Policies",
      items: [
        { to: "/shop", label: "Refund Policy", icon: FileText, active: view === "refund", onClick: () => go({ view: "refund" }) },
        { to: "/shop", label: "Multi-room Rules", icon: Users, active: view === "multi_room", onClick: () => go({ view: "multi_room" }) },
        { to: "/shop", label: "Triple-room Rules", icon: BedDouble, active: view === "triple_room", onClick: () => go({ view: "triple_room" }) },
      ],
    },
    ...(isAdmin && adminUnlocked
      ? [
          {
            label: "Admin",
            items: [
              ...(isAdminOnly
                ? [
                    { to: "/shop", label: "Manage Products", icon: Settings, active: view === "admin", onClick: () => go({ view: "admin" }) },
                    { to: "/shop", label: "Discount Codes", icon: Tag, active: (view as string) === "discounts", onClick: () => go({ view: "discounts" }) },
                  ]
                : []),
              { to: "/shop", label: "Shop Admin", icon: Receipt, active: view === "orders" && scope === "all", onClick: () => go({ view: "orders", scope: "all" }) },
            ],
          } as ChannelGroup,
        ]
      : []),
  ];

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0">
        {/* Admin-only quick nav: regular users navigate via Storefront tabs */}
        {isAdmin && adminUnlocked && (
          <nav className="shrink-0 border-b border-border bg-surface/60 backdrop-blur px-3 md:px-6 py-2 flex items-center gap-4 overflow-x-auto">
            {groups.filter((g) => g.label === "Admin").map((g) => (
              <div key={g.label} className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mr-1 hidden md:inline">{g.label}</span>
                {g.items.map((it) => {
                  const Icon = it.icon;
                  return (
                    <button
                      key={it.label}
                      onClick={it.onClick}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap",
                        it.active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface-2",
                      )}
                    >
                      {Icon && <Icon className="size-3.5" />}
                      {it.label}
                    </button>
                  );
                })}
              </div>
            ))}
            <button
              onClick={() => go({ view: "store" })}
              className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 whitespace-nowrap"
            >
              <ArrowLeft className="size-3.5" /> Back to Shop
            </button>
          </nav>
        )}
        <div className="flex-1 flex min-h-0 min-w-0">
          {view === "store" && <Storefront />}
          {view === "orders" && <OrdersView selectedId={id} isAdmin={isAdmin} adminUnlocked={adminUnlocked} initialScope={scope === "all" ? "all" : "mine"} />}
          {view === "admin" && isAdminOnly && adminUnlocked && <AdminProducts />}
          {(view as string) === "discounts" && isAdminOnly && adminUnlocked && <AdminDiscounts />}
          {(view === "refund" || view === "multi_room" || view === "triple_room") && (
            view === "refund"
              ? <PolicyView policyKey="refund" isAdmin={isAdmin} />
              : <RoomPolicyView roomKey={view as "multi_room" | "triple_room"} isAdmin={isAdmin} />
          )}
        </div>
      </div>
    </>
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
            <button onClick={onAdd} className={`px-3 py-1.5 rounded-lg border text-xs font-medium ${qty > 0 ? "bg-sky-500/15 border-sky-400/60 text-sky-300" : "bg-surface-2 border-border hover:border-sky-400/60"}`}>{qty > 0 ? "Added to cart" : "Add to cart"}</button>
          )}
        </div>
        {qty > 0 && (
          <button onClick={onPlace} className="mt-2 w-full px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:opacity-90 shadow shadow-blue-500/20">
            Added
          </button>
        )}
      </div>
    </div>
  );
}

// ============ STOREFRONT ============
type OrderProgress = { id: string; status: string; paid_at: string | null; completed_at: string | null; created_at: string } | null;

function SidebarOrderProgress({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
      if (!cancelled) setOrder((data as Order | null) ?? null);
    };
    void load();
    const ch = supabase
      .channel(`sidebar-order-progress-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [orderId]);
  if (!order) return null;
  return (
    <div className="mt-6 px-3 pb-3">
      <OrderProgressStrip order={order} />
    </div>
  );
}

function SidebarLatestOrderProgress() {
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setOrder((data as Order | null) ?? null);
    };
    void load();
    const ch = supabase
      .channel(`sidebar-latest-order-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);
  if (!order) return null;
  return (
    <div className="mt-6 px-3 pb-3">
      <OrderProgressStrip order={order} />
    </div>
  );
}

export function OrderProgressStrip({ order }: { order: { status: string; paid_at?: string | null; completed_at?: string | null } }) {
  const placed = true;
  const paid = !!order.paid_at;
  const setup = order.status === "completed" || !!order.completed_at;
  const cancelled = order.status === "cancelled";

  const steps = [
    {
      n: 1,
      title: "Place Order",
      icon: ShoppingBag,
      done: placed && !cancelled,
      active: !cancelled && !paid,
      cancelled: false,
    },
    {
      n: 2,
      title: cancelled ? "Cancelled" : "Pay Invoice",
      icon: cancelled ? X : Receipt,
      done: paid && !cancelled,
      active: !cancelled && placed && !paid,
      cancelled,
    },
    {
      n: 3,
      title: "Account Setup",
      icon: UserCog,
      done: setup && !cancelled,
      active: !cancelled && paid && !setup,
      cancelled,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = cancelled ? 0 : Math.round((completed / steps.length) * 100);

  return (
    <div className="relative rounded-xl p-[1px] bg-gradient-to-br from-violet-600 via-fuchsia-500 to-blue-600 shadow-[0_6px_24px_-6px_rgba(124,58,237,0.5)]">
      <div className="rounded-[11px] bg-surface/95 backdrop-blur p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold bg-gradient-to-r from-violet-400 via-fuchsia-400 to-sky-400 bg-clip-text text-transparent">
            Order Progress
          </span>
          <span className="text-[10px] font-semibold text-muted-foreground">
            {cancelled ? "Cancelled" : `${completed}/${steps.length} · ${pct}%`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-700 rounded-full",
              cancelled
                ? "bg-destructive"
                : "bg-gradient-to-r from-violet-600 via-fuchsia-500 to-sky-500 shadow-[0_0_10px_rgba(217,70,239,0.6)]",
            )}
            style={{ width: `${cancelled ? 100 : pct}%` }}
          />
        </div>
        <ol className="relative space-y-2">
          {steps.map((s, idx) => (
            <li key={s.n} className="relative">
              {idx < steps.length - 1 && (
                <span
                  className={cn(
                    "absolute left-[18px] top-9 bottom-[-8px] w-0.5 rounded",
                    s.done && !s.cancelled
                      ? "bg-gradient-to-b from-emerald-400 to-emerald-500/30"
                      : "bg-border",
                  )}
                />
              )}
              <div
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-all",
                  s.cancelled
                    ? "border-destructive/50 bg-destructive/10"
                    : s.done
                      ? "border-emerald-500/50 bg-emerald-500/10"
                      : s.active
                        ? "border-fuchsia-400/60 bg-gradient-to-r from-violet-600/15 via-fuchsia-500/15 to-sky-500/15 ring-1 ring-fuchsia-400/40 shadow-[0_0_18px_-4px_rgba(217,70,239,0.55)]"
                        : "border-border bg-surface-2/50 opacity-70",
                )}
              >
                <span
                  className={cn(
                    "size-9 rounded-lg grid place-items-center shrink-0 shadow-inner",
                    s.cancelled
                      ? "bg-destructive/25 text-destructive"
                      : s.done
                        ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white"
                        : s.active
                          ? "bg-gradient-to-br from-violet-600 via-fuchsia-500 to-sky-500 text-white animate-pulse"
                          : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {s.done && !s.cancelled ? <Check className="size-4" /> : <s.icon className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground leading-none font-semibold">
                    Step {s.n}
                  </div>
                  <div className="text-[12px] font-bold truncate flex items-center gap-1.5 mt-0.5">
                    {s.title}
                    {s.active && !s.cancelled && (
                      <span className="size-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
                    )}
                  </div>
                </div>
                {s.done && !s.cancelled && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 shrink-0">Done</span>
                )}
                {s.active && !s.cancelled && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-fuchsia-300 shrink-0">Now</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function BuySteps({ latestOrder, onBrowse, onViewOrder }: {
  latestOrder: OrderProgress;
  onBrowse: () => void;
  onViewOrder: (id: string) => void;
}) {
  const placed = !!latestOrder;
  const paid = !!latestOrder?.paid_at;
  const setup = latestOrder?.status === "completed" || !!latestOrder?.completed_at;
  const cancelled = latestOrder?.status === "cancelled";

  const steps = [
    {
      n: 1, title: "Place Order", icon: ShoppingBag,
      done: placed,
      active: !placed,
      cancelled: false,
      desc: placed
        ? `Order received on ${new Date(latestOrder!.created_at).toLocaleDateString()}.`
        : "Pick your plan in the Shop tab and add it to your order.",
      cta: placed ? "View order" : "Browse products",
      action: placed ? () => onViewOrder(latestOrder!.id) : onBrowse,
    },
    {
      n: 2,
      title: cancelled ? "Order Cancelled" : "Pay Invoice",
      icon: cancelled ? X : Receipt,
      done: paid && !cancelled,
      active: placed && !paid && !cancelled,
      cancelled,
      desc: cancelled
        ? "This order was cancelled. Browse the shop to place a new order."
        : paid
        ? `Invoice paid on ${new Date(latestOrder!.paid_at!).toLocaleDateString()}.`
        : placed ? "Awaiting your payment — open the order to view the invoice."
                 : "We'll send your invoice — pay it securely and we'll confirm receipt.",
      cta: cancelled ? "Browse products" : placed ? "Open order" : undefined,
      action: cancelled ? onBrowse : placed ? () => onViewOrder(latestOrder!.id) : undefined,
    },
    {
      n: 3, title: "Account Setup", icon: UserCog,
      done: setup && !cancelled,
      active: paid && !setup && !cancelled,
      cancelled,
      desc: cancelled
        ? "Unavailable — order was cancelled."
        : setup
        ? `All set! Account completed on ${new Date(latestOrder!.completed_at ?? latestOrder!.created_at).toLocaleDateString()}.`
        : paid ? "We're setting up your account and will share your login details shortly."
               : "We set up your account and share your login details to get you started.",
      cta: cancelled ? undefined : placed ? "View order" : undefined,
      action: cancelled ? undefined : placed ? () => onViewOrder(latestOrder!.id) : undefined,
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  const pct = cancelled ? 0 : Math.round((completed / steps.length) * 100);

  return (
    <section className="-mt-12 md:-mt-16 relative z-10 px-2 md:px-0 pb-6">
      <div className="mb-4 text-center">
        <div className="text-[11px] uppercase tracking-[0.25em] text-sky-300/80">How to buy</div>
        <h2 className="font-display text-2xl md:text-3xl font-bold mt-1">Three simple steps</h2>
        <div className="mt-3 max-w-md mx-auto">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
            <span>{placed ? `${completed} of ${steps.length} complete` : "Not started yet"}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-blue-600 transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        {steps.map((s) => (
          <div
            key={s.n}
            className={cn(
              "group relative rounded-2xl border p-5 transition",
              s.cancelled
                ? "border-destructive/40 bg-destructive/5"
                : s.done
                ? "border-emerald-500/40 bg-emerald-500/5 shadow-lg shadow-emerald-500/10"
                : s.active
                  ? "border-sky-400/60 bg-surface shadow-lg shadow-blue-500/10 ring-2 ring-sky-400/30"
                  : "border-border bg-surface opacity-80",
              s.cancelled && s.n === 3 && "opacity-50 grayscale pointer-events-none",
            )}
          >
            <div className={cn(
              "absolute -top-3 left-5 inline-flex items-center gap-1 text-[11px] font-bold tracking-wider px-2 py-0.5 rounded-full text-white",
              s.cancelled
                ? "bg-destructive"
                : s.done
                ? "bg-gradient-to-r from-emerald-500 to-green-600"
                : s.active
                  ? "bg-gradient-to-r from-violet-600 to-blue-600"
                  : "bg-surface-2 text-muted-foreground",
            )}>
              {s.cancelled
                ? (s.n === 2 ? <><X className="size-3" /> CANCELLED</> : `STEP ${s.n}`)
                : s.done ? <><Check className="size-3" /> DONE</> : `STEP ${s.n}`}
            </div>
            <div className={cn(
              "size-10 rounded-xl grid place-items-center mb-3",
              s.cancelled
                ? "bg-destructive/15 text-destructive"
                : s.done
                ? "bg-emerald-500/15 text-emerald-400"
                : s.active
                  ? "bg-gradient-to-br from-violet-600/20 to-blue-600/20 text-sky-300"
                  : "bg-surface-2 text-muted-foreground",
            )}>
              <s.icon className="size-5" />
            </div>
            <h3 className="font-display font-semibold text-lg flex items-center gap-2">
              {s.title}
              {s.active && <span className="size-2 rounded-full bg-sky-400 animate-pulse" />}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
            {s.action && s.cta && (
              <button onClick={s.action} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-sky-400 hover:text-sky-300">
                {s.cta} <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [dbCategories, setDbCategories] = useState<ProductCategory[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [showCheckout, setShowCheckout] = useState(false);
  const [tab, setTab] = useState<string>("welcome");
  const navigate = useNavigate();
  const { user, hasAny, refreshRoles } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [ratings, setRatings] = useState<Record<string, { sum: number; count: number }>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [latestOrder, setLatestOrder] = useState<{ id: string; status: string; paid_at: string | null; completed_at: string | null; created_at: string } | null>(null);

  const reloadLatestOrder = async () => {
    if (!user) { setLatestOrder(null); return; }
    const { data } = await supabase
      .from("orders")
      .select("id,status,paid_at,completed_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestOrder((data as typeof latestOrder) ?? null);
  };

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
    reloadLatestOrder();
    if (!user) return;
    const ch = supabase
      .channel(`orders-progress-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, (payload) => {
        reloadLatestOrder();
        const newRow = (payload as { new?: { status?: string; completed_at?: string | null } }).new;
        const oldRow = (payload as { old?: { status?: string; completed_at?: string | null } }).old;
        const becameCompleted =
          newRow && (newRow.status === "completed" || !!newRow.completed_at) &&
          (!oldRow || (oldRow.status !== "completed" && !oldRow.completed_at));
        if (becameCompleted) { void refreshRoles(); }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
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

  const placeOrder = async (info: { name: string; email: string; customer_type: "new" | "existing"; existing_username: string; discount_code: string; discount_cents: number; wants_adult_content: boolean }) => {
    if (!user || cartItems.length === 0) return;
    let verifiedDiscountCents = 0;
    const submittedCode = info.discount_code.trim();
    if (submittedCode) {
      const { data: code } = await supabase
        .from("discount_codes")
        .select("*")
        .ilike("code", submittedCode)
        .eq("is_active", true)
        .maybeSingle();
      if (!code) { toast.error("Invalid discount code"); return; }
      const { data: links } = await supabase
        .from("discount_code_products")
        .select("product_id")
        .eq("discount_code_id", code.id);
      const allowedIds = (links ?? []).map((r: { product_id: string }) => r.product_id);
      if (allowedIds.length > 0 && cartItems.some((p) => !allowedIds.includes(p.id))) {
        toast.error("This discount code is not allowed for one or more products in your cart");
        return;
      }
      if (code.amount_cents) verifiedDiscountCents = Math.min(total, code.amount_cents);
      if (code.percent) verifiedDiscountCents = Math.round(total * (code.percent / 100));
    }
    const finalTotal = Math.max(0, total - verifiedDiscountCents);
    const { data: order, error } = await supabase.from("orders").insert({
      user_id: user.id, total_cents: finalTotal, status: "pending",
      shipping_name: info.name,
      email: info.email,
      customer_type: info.customer_type,
      existing_username: info.existing_username?.trim() || null,
      discount_code: submittedCode || null,
      discount_cents: verifiedDiscountCents,
      wants_adult_content: info.wants_adult_content,
    } as never).select().single();
    if (error || !order) { toast.error(error?.message ?? "Failed"); return; }
    const items = cartItems.map((p) => ({
      order_id: order.id, product_id: p.id, product_name: p.name,
      unit_price_cents: p.price_cents, quantity: cart[p.id],
    }));
    const { error: ie } = await supabase.from("order_items").insert(items as never);
    if (ie) { toast.error(ie.message); return; }
    // Open a support ticket in the admin/management-only "Orders" category.
    // The ticket replaces the old order chat as the primary communication
    // channel; the order record itself still drives the payment lifecycle.
    let newTicketId: string | null = null;
    try {
      const { data: ordersCat } = await supabase
        .from("ticket_categories")
        .select("id")
        .eq("slug", "orders")
        .maybeSingle();
      if (ordersCat?.id) {
        const itemLines = cartItems
          .map((p) => `• ${p.name} × ${cart[p.id]}`)
          .join("\n");
        const { data: ticket } = await supabase
          .from("tickets")
          .insert({
            user_id: user.id,
            category_id: ordersCat.id,
            subject: `New order #${String(order.id).slice(0, 8)}`,
            priority: "normal",
            order_id: order.id,
          } as never)
          .select()
          .single();
        if (ticket?.id) {
          newTicketId = ticket.id;
          const ticketBody = [
            `🧾 New order placed`,
            `Order ID: ${order.id}`,
            `Customer: ${info.customer_type === "existing"
              ? `Existing — upgrading @${info.existing_username.trim()}`
              : "New customer"}`,
            `Adult content access: ${info.wants_adult_content ? "Yes" : "No"}`,
            ``,
            `Items:`,
            itemLines,
          ].join("\n");
          await supabase.from("ticket_messages").insert({
            ticket_id: ticket.id,
            sender_id: user.id,
            content: ticketBody,
          } as never);
          await supabase.from("ticket_messages").insert({
            ticket_id: ticket.id,
            sender_id: user.id,
            content: `💳 How would you like to pay for this order (${fmt(finalTotal)})?\n\nUse the "Pay" button at the top of this ticket to choose your payment method — Square (card / Apple Pay / Google Pay), PayPal, or USDT.`,
          } as never);
          const oohMsg = await getOutOfHoursMessage();
          if (oohMsg) {
            await supabase.from("ticket_messages").insert({
              ticket_id: ticket.id,
              sender_id: user.id,
              content: oohMsg,
            } as never);
          }
        }
      }
    } catch (e) {
      console.warn("[shop] failed to open order ticket", e);
    }
    setCart({}); setShowCheckout(false);
    toast.success("Order placed!");
    reloadLatestOrder();
    if (newTicketId) {
      navigate({ to: "/tickets", search: { id: newTicketId } });
    } else {
      navigate({ to: "/shop", search: { view: "orders", id: order.id } });
    }
  };

  return (
    <main className="flex-1 flex flex-col overflow-hidden">
      <div
        className={cn(
          "flex-1 overflow-y-auto",
          tab === "orders" && "relative bg-cover bg-center bg-fixed min-h-screen",
        )}
        style={tab === "orders" ? { backgroundImage: `url(${shopOrdersBg})` } : undefined}
      >
        {tab === "orders" && (
          <div className="absolute inset-0 min-h-screen bg-gradient-to-b from-[#1a0b2e]/85 via-[#1a0b2e]/65 to-[#1a0b2e]/90 backdrop-blur-[2px] pointer-events-none" aria-hidden />
        )}
        <div className="relative z-10 px-6 pt-6 min-h-screen">
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="bg-surface-2 border border-border flex flex-wrap h-auto">
              <TabsTrigger value="welcome" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Welcome</TabsTrigger>
              <TabsTrigger value="shop" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Shop</TabsTrigger>
              <TabsTrigger value="orders" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">My Orders</TabsTrigger>
              <TabsTrigger value="refund" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Refund Policy</TabsTrigger>
              <TabsTrigger value="multi_room" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Multi-room Rules</TabsTrigger>
              <TabsTrigger value="triple_room" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-sky-400 data-[state=active]:text-white">Triple-room Rules</TabsTrigger>
            </TabsList>

            <TabsContent value="welcome" className="mt-4">
              <section className="relative overflow-hidden -mx-6 -mt-6">
                <div className="absolute inset-0">
                  <img src={shopHero} alt="" aria-hidden className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-700/80 via-fuchsia-700/70 to-blue-700/80" />
                  <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-background" />
                </div>
                <div className="relative px-6 md:px-10 pt-10 md:pt-16 pb-20 md:pb-28 max-w-3xl">
                  <div className="text-xs uppercase tracking-[0.2em] text-sky-200/90 mb-3">BM Support · Shop</div>
                  <h1 className="font-display text-4xl md:text-6xl font-bold leading-tight text-white drop-shadow">
                    Welcome to the Store
                  </h1>
                  <p className="mt-4 text-sky-100/90 max-w-xl text-base md:text-lg">
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
              </section>

              <BuySteps
                latestOrder={latestOrder}
                onBrowse={() => setTab("shop")}
                onViewOrder={(id) => navigate({ to: "/shop", search: { view: "orders", id } })}
              />
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
                          <ProductCard key={p.id} p={p} qty={cart[p.id] ?? 0} onAdd={() => add(p.id)} onSub={() => sub(p.id)} onPlace={() => setShowCheckout(true)} rating={myRatings[p.id] ?? 0} average={ratings[p.id] ? ratings[p.id].sum / ratings[p.id].count : 0} ratingCount={ratings[p.id]?.count ?? 0} onRate={(v) => rateProduct(p.id, v)} />
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
                      <ProductCard key={p.id} p={p} qty={cart[p.id] ?? 0} onAdd={() => add(p.id)} onSub={() => sub(p.id)} onPlace={() => setShowCheckout(true)} rating={myRatings[p.id] ?? 0} average={ratings[p.id] ? ratings[p.id].sum / ratings[p.id].count : 0} ratingCount={ratings[p.id]?.count ?? 0} onRate={(v) => rateProduct(p.id, v)} />
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="refund" className="mt-4"><InlinePolicy policyKey="refund" /></TabsContent>
            <TabsContent value="multi_room" className="mt-4"><InlinePolicy policyKey="multi_room" /></TabsContent>
            <TabsContent value="triple_room" className="mt-4"><InlinePolicy policyKey="triple_room" /></TabsContent>
            <TabsContent value="orders" className="mt-4">
              <MyOrdersTab
                onOpenOrder={(id) => navigate({ to: "/shop", search: { view: "orders", id } })}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      {showCheckout && (
        <Checkout
          items={cartItems.map((p) => ({ ...p, qty: cart[p.id] }))}
          total={total}
          onClose={() => setShowCheckout(false)}
          onPlace={placeOrder}
          onRemoveItem={(id) => {
            setCart((c) => {
              const next = { ...c };
              delete next[id];
              if (Object.keys(next).length === 0) setShowCheckout(false);
              return next;
            });
          }}
        />
      )}
      {count > 0 && !showCheckout && (
        <CartWidget
          items={cartItems.map((p) => ({ id: p.id, name: p.name, qty: cart[p.id], price_cents: p.price_cents }))}
          total={total}
          onAdd={(id) => add(id)}
          onSub={(id) => sub(id)}
          onRemove={(id) => setCart((c) => { const n = { ...c }; delete n[id]; return n; })}
          onCheckout={() => setShowCheckout(true)}
        />
      )}
    </main>
  );
}

function CartWidget({ items, total, onAdd, onSub, onRemove, onCheckout }: {
  items: { id: string; name: string; qty: number; price_cents: number }[];
  total: number;
  onAdd: (id: string) => void;
  onSub: (id: string) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
}) {
  const [open, setOpen] = useState(true);
  const count = items.reduce((s, i) => s + i.qty, 0);
  return (
    <div className="fixed bottom-4 right-4 z-40 w-[320px] max-w-[calc(100vw-2rem)]">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl shadow-black/30 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-violet-600 to-blue-600 text-white"
        >
          <span className="inline-flex items-center gap-2 font-semibold text-sm">
            <ShoppingBag className="size-4" />
            Your cart
            <span className="bg-white/20 px-1.5 rounded-full text-xs">{count}</span>
          </span>
          <span className="text-xs opacity-90">{open ? "Hide" : "Show"}</span>
        </button>
        {open && (
          <>
            <div className="max-h-64 overflow-y-auto divide-y divide-border">
              {items.map((i) => (
                <div key={i.id} className="p-3 flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">{_currentFmt(i.price_cents)} each</div>
                  </div>
                  <div className="flex items-center gap-1 bg-surface-2 rounded-lg">
                    <button onClick={() => onSub(i.id)} aria-label="Decrease" className="size-7 grid place-items-center hover:text-sky-400"><Minus className="size-3.5" /></button>
                    <span className="text-sm font-medium w-5 text-center">{i.qty}</span>
                    <button onClick={() => onAdd(i.id)} aria-label="Increase" className="size-7 grid place-items-center hover:text-sky-400"><Plus className="size-3.5" /></button>
                  </div>
                  <button onClick={() => onRemove(i.id)} aria-label={`Remove ${i.name}`} className="p-1 rounded hover:bg-surface-2 text-destructive">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-border space-y-2 bg-surface-2/40">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-display font-bold">{_currentFmt(total)}</span>
              </div>
              <button
                onClick={onCheckout}
                className="w-full px-3 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:opacity-90"
              >
                Place Order
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
  const deviceKey = `${roomKey}_device_usage`;
  const mobileKey = `${roomKey}_mobile_usage`;
  const punishmentKey = `${roomKey}_punishment`;
  const allKeys = [deviceKey, mobileKey, punishmentKey];
  const fallbackTitle: Record<string, string> = {
    [deviceKey]: "Device Usage",
    [mobileKey]: "Mobile Usage",
    [punishmentKey]: "Punishment",
  };
  const [policies, setPolicies] = useState<Record<string, PolicyRow>>({});
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [rulesTab, setRulesTab] = useState<"device" | "mobile">("device");
  const title = roomKey === "multi_room" ? "Multi-room Rules" : "Triple-room Rules";

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    setEditingKey(null);
    supabase
      .from("shop_policies")
      .select("*")
      .in("key", allKeys)
      .then(({ data }) => {
        if (cancel) return;
        const rows = (data ?? []) as PolicyRow[];
        const map: Record<string, PolicyRow> = {};
        for (const k of allKeys) {
          map[k] = rows.find((x) => x.key === k) ?? { key: k, title: fallbackTitle[k], body: "", updated_at: new Date().toISOString() };
        }
        setPolicies(map);
        setLoading(false);
      });
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomKey]);

  const beginEdit = (key: string) => {
    setDraft(policies[key]?.body ?? "");
    setEditingKey(key);
  };

  const save = async () => {
    if (!editingKey) return;
    const key = editingKey;
    const existing = policies[key];
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("shop_policies").upsert({
      key,
      title: existing?.title ?? fallbackTitle[key],
      body: draft,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    const updated = { ...(existing ?? { key, title: fallbackTitle[key] }), body: draft, updated_at: new Date().toISOString() } as PolicyRow;
    setPolicies((p) => ({ ...p, [key]: updated }));
    setEditingKey(null);
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
          </div>
        </section>

        {loading ? (
          <div className="grid place-items-center py-16 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Usage rules — tabbed */}
            <div className="relative overflow-hidden rounded-2xl border border-border shadow-soft bg-surface-1">
              <Tabs value={rulesTab} onValueChange={(v) => setRulesTab(v as "device" | "mobile")}>
                <div className="px-6 pt-6">
                  <TabsList className="grid grid-cols-2 w-full h-auto p-1 bg-surface-2">
                    <TabsTrigger value="device" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/70 data-[state=active]:text-primary-foreground">
                      <Monitor className="size-4" /> Device Usage
                    </TabsTrigger>
                    <TabsTrigger value="mobile" className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary data-[state=active]:to-primary/70 data-[state=active]:text-primary-foreground">
                      <Smartphone className="size-4" /> Mobile Usage
                    </TabsTrigger>
                  </TabsList>
                </div>
                <TabsContent value="device" className="mt-0">
                  <PolicyCard
                    tone="rules"
                    title="Device Usage"
                    updatedAt={policies[deviceKey]?.updated_at}
                    body={policies[deviceKey]?.body ?? ""}
                    isAdmin={isAdmin}
                    editing={editingKey === deviceKey}
                    draft={draft}
                    setDraft={setDraft}
                    onEdit={() => beginEdit(deviceKey)}
                    onCancel={() => setEditingKey(null)}
                    onSave={save}
                    saving={saving}
                    disabled={editingKey !== null && editingKey !== deviceKey}
                    bare
                  />
                </TabsContent>
                <TabsContent value="mobile" className="mt-0">
                  <PolicyCard
                    tone="rules"
                    title="Mobile Usage"
                    updatedAt={policies[mobileKey]?.updated_at}
                    body={policies[mobileKey]?.body ?? ""}
                    isAdmin={isAdmin}
                    editing={editingKey === mobileKey}
                    draft={draft}
                    setDraft={setDraft}
                    onEdit={() => beginEdit(mobileKey)}
                    onCancel={() => setEditingKey(null)}
                    onSave={save}
                    saving={saving}
                    disabled={editingKey !== null && editingKey !== mobileKey}
                    bare
                  />
                </TabsContent>
              </Tabs>
            </div>

            {/* Punishment with judge bg */}
            <PolicyCard
              tone="punishment"
              title="Punishment"
              updatedAt={policies[punishmentKey]?.updated_at}
              body={policies[punishmentKey]?.body ?? ""}
              isAdmin={isAdmin}
              editing={editingKey === punishmentKey}
              draft={draft}
              setDraft={setDraft}
              onEdit={() => beginEdit(punishmentKey)}
              onCancel={() => setEditingKey(null)}
              onSave={save}
              saving={saving}
              disabled={editingKey !== null && editingKey !== punishmentKey}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function PolicyCard({
  tone, title, updatedAt, body, isAdmin, editing, draft, setDraft,
  onEdit, onCancel, onSave, saving, disabled, bare = false,
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
  bare?: boolean;
}) {
  const isPunishment = tone === "punishment";
  return (
    <article
      className={cn(
        "relative overflow-hidden",
        bare ? "" : "rounded-2xl border border-border shadow-soft",
        isPunishment ? "text-white" : (bare ? "" : "bg-surface-1"),
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

function Checkout({ items, total, onClose, onPlace, onRemoveItem }: {
  items: (Product & { qty: number })[]; total: number; onClose: () => void;
  onPlace: (s: { name: string; email: string; customer_type: "new" | "existing"; existing_username: string; discount_code: string; discount_cents: number; wants_adult_content: boolean }) => void;
  onRemoveItem: (id: string) => void;
}) {
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [customerType, setCustomerType] = useState<"new" | "existing">("new");
  const [existingUsername, setExistingUsername] = useState("");
  const [adultContent, setAdultContent] = useState<"yes" | "no" | "">("");
  const [appliedCode, setAppliedCode] = useState<DiscountCode | null>(null);
  const [autoLoading, setAutoLoading] = useState(true);

  const requiresMulti = useMemo(
    () => items.some((i) => (i.category ?? "").toLowerCase().includes("multi")),
    [items],
  );
  const requiresTriple = useMemo(
    () => items.some((i) => (i.category ?? "").toLowerCase().includes("triple")),
    [items],
  );
  const [agreedMulti, setAgreedMulti] = useState(false);
  const [agreedTriple, setAgreedTriple] = useState(false);

  const discountCents = useMemo(() => {
    if (!appliedCode) return 0;
    if (appliedCode.amount_cents) return Math.min(total, appliedCode.amount_cents);
    if (appliedCode.percent) return Math.round(total * (appliedCode.percent / 100));
    return 0;
  }, [appliedCode, total]);
  const finalTotal = Math.max(0, total - discountCents);

  // Auto-pick the best valid discount code for this cart.
  // Rule: if the user has a personal code (user_id = current user) that applies,
  // use ONLY that one — global codes are ignored. Otherwise pick the global code
  // that gives the biggest discount on this cart.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAutoLoading(true);
      const cartIds = items.map((i) => i.id);
      if (cartIds.length === 0) {
        if (!cancelled) { setAppliedCode(null); setAutoLoading(false); }
        return;
      }
      const { data } = await supabase
        .from("discount_codes")
        .select("*")
        .eq("is_active", true);
      const codes = (data ?? []) as DiscountCode[];
      if (codes.length === 0) {
        if (!cancelled) { setAppliedCode(null); setAutoLoading(false); }
        return;
      }
      const { data: links } = await supabase
        .from("discount_code_products")
        .select("discount_code_id, product_id")
        .in("discount_code_id", codes.map((c) => c.id));
      const linkMap = new Map<string, string[]>();
      (links ?? []).forEach((l: { discount_code_id: string; product_id: string }) => {
        const arr = linkMap.get(l.discount_code_id) ?? [];
        arr.push(l.product_id);
        linkMap.set(l.discount_code_id, arr);
      });
      const applies = (c: DiscountCode) => {
        const restricted = linkMap.get(c.id);
        if (!restricted || restricted.length === 0) return true;
        return cartIds.every((id) => restricted.includes(id));
      };
      const valueOf = (c: DiscountCode) => {
        if (c.amount_cents) return Math.min(total, c.amount_cents);
        if (c.percent) return Math.round(total * (c.percent / 100));
        return 0;
      };
      const pickBest = (list: DiscountCode[]) =>
        list.filter(applies).sort((a, b) => valueOf(b) - valueOf(a))[0] ?? null;

      const personal = user ? codes.filter((c) => c.user_id === user.id) : [];
      const chosen = personal.length > 0
        ? pickBest(personal)
        : pickBest(codes.filter((c) => !c.user_id));

      if (!cancelled) {
        setAppliedCode(chosen);
        setAutoLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [items, total, user?.id]);

  const canSubmit =
    !!name && !!email && (customerType === "new" || !!existingUsername.trim())
    && adultContent !== ""
    && (!requiresMulti || agreedMulti)
    && (!requiresTriple || agreedTriple);

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
              <div key={i.id} className="flex items-center justify-between gap-2 text-sm group">
                <span className="min-w-0 truncate">{i.name} <span className="text-muted-foreground">× {i.qty}</span></span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-medium">{fmt(i.price_cents * i.qty)}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(i.id)}
                    aria-label={`Remove ${i.name}`}
                    title="Remove from order"
                    className="p-1 rounded hover:bg-surface-2 text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
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
              <input
                value={existingUsername}
                onChange={(e) => setExistingUsername(e.target.value)}
                placeholder="Username you're extending *"
                required
                className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border focus:border-primary outline-none"
              />
            )}
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Adult content access <span className="text-destructive">*</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAdultContent("yes")}
                  className={cn("flex-1 px-3 py-2 rounded-lg text-sm border", adultContent === "yes" ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border")}>
                  Yes
                </button>
                <button type="button" onClick={() => setAdultContent("no")}
                  className={cn("flex-1 px-3 py-2 rounded-lg text-sm border", adultContent === "no" ? "bg-primary text-primary-foreground border-primary" : "bg-surface-2 border-border")}>
                  No
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">Required — do you want access to adult content?</p>
            </div>
            <div className="space-y-2">
              {autoLoading ? (
                <div className="text-xs text-muted-foreground px-2 py-1.5">Checking for voucher codes…</div>
              ) : appliedCode ? (
                <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-success/10 text-success">
                  <span className="inline-flex items-center gap-1.5">
                    <Tag className="size-3.5" />
                    Voucher <span className="font-mono font-semibold">{appliedCode.code}</span> applied automatically
                    {appliedCode.description ? <span className="text-muted-foreground">— {appliedCode.description}</span> : null}
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground px-2 py-1.5">No voucher codes available for this order.</div>
              )}
            </div>
          </div>
        </div>
        {(requiresMulti || requiresTriple) && (
          <div className="px-5 pb-2 space-y-2">
            {requiresMulti && (
              <label className="flex items-start gap-2 text-xs p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 cursor-pointer">
                <input type="checkbox" checked={agreedMulti} onChange={(e) => setAgreedMulti(e.target.checked)} className="mt-0.5 accent-amber-500" />
                <span>
                  I have read and agree to the{" "}
                  <a href="/shop?view=multi_room" target="_blank" rel="noreferrer" className="underline font-medium">Multi-room Usage Rules</a>.
                </span>
              </label>
            )}
            {requiresTriple && (
              <label className="flex items-start gap-2 text-xs p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 cursor-pointer">
                <input type="checkbox" checked={agreedTriple} onChange={(e) => setAgreedTriple(e.target.checked)} className="mt-0.5 accent-amber-500" />
                <span>
                  I have read and agree to the{" "}
                  <a href="/shop?view=triple_room" target="_blank" rel="noreferrer" className="underline font-medium">Triple-room Usage Rules</a>.
                </span>
              </label>
            )}
          </div>
        )}
        <div className="p-5 border-t border-border flex flex-wrap gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-surface-2 text-sm">Cancel</button>
          <button onClick={() => onPlace({ name, email, customer_type: customerType, existing_username: existingUsername, discount_code: appliedCode?.code ?? "", discount_cents: discountCents, wants_adult_content: adultContent === "yes" })}
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
  paid: "text-success bg-success/10",
  completed: "text-success bg-success/10",
  cancelled: "text-destructive bg-destructive/10",
};

function OrdersView({ selectedId, isAdmin, adminUnlocked, initialScope }: { selectedId?: string; isAdmin: boolean; adminUnlocked: boolean; initialScope: "mine" | "all" }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [cryptoOrderIds, setCryptoOrderIds] = useState<Set<string>>(new Set());
  const [cryptoPendingIds, setCryptoPendingIds] = useState<Set<string>>(new Set());
  const [scope, setScope] = useState<"mine" | "all">(isAdmin && adminUnlocked ? initialScope : "mine");
  const navigate = useNavigate();
  const { user } = useAuth();

  const tabForStatus = (status: OrderStatus) => {
    if (status === "completed") return "completed";
    if (status === "cancelled") return "cancelled";
    return "processing";
  };

  const [ordersTab, setOrdersTab] = useState<"processing" | "completed" | "cancelled">("processing");
  useEffect(() => {
    if (selectedId) {
      const o = orders.find((x) => x.id === selectedId);
      if (o) setOrdersTab(tabForStatus(o.status));
    }
  }, [selectedId, orders]);

  const load = async () => {
    let q = supabase.from("orders").select("*").order("created_at", { ascending: false });
    if ((scope === "mine" || !adminUnlocked) && user) q = q.eq("user_id", user.id);
    const { data } = await q;
    const rows = (data ?? []) as Order[];
    setOrders(rows);
    if (rows.length > 0) {
      const ids = rows.map((o) => o.id);
      const { data: pays } = await supabase
        .from("order_payments")
        .select("order_id,provider,status")
        .in("order_id", ids)
        .eq("provider", "nowpayments");
      const all = new Set<string>();
      const pending = new Set<string>();
      (pays ?? []).forEach((p: any) => {
        all.add(p.order_id);
        if (!["finished", "superseded"].includes(String(p.status))) pending.add(p.order_id);
      });
      setCryptoOrderIds(all);
      setCryptoPendingIds(pending);
    } else {
      setCryptoOrderIds(new Set());
      setCryptoPendingIds(new Set());
    }
  };
  useEffect(() => { if (isAdmin && adminUnlocked) setScope(initialScope); }, [isAdmin, adminUnlocked, initialScope]);
  useEffect(() => { if (!adminUnlocked && scope === "all") setScope("mine"); }, [adminUnlocked, scope]);
  useEffect(() => { load(); }, [scope, user?.id, adminUnlocked]);
  useEffect(() => {
    const ch = supabase
      .channel("orders-list")
      .on("postgres_changes", { event: "*", schema: "private", table: "orders" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [scope, user?.id, adminUnlocked]);

  const processingOrders = orders.filter((o) => ["pending", "processing", "paid"].includes(o.status));
  const completedOrders = orders.filter((o) => o.status === "completed");
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");

  const renderOrderList = (list: Order[]) => (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 min-h-[60vh]">
      <div className={cn(
        "grid grid-cols-1 sm:grid-cols-2 gap-3 content-start",
        selectedId ? "hidden lg:grid" : "",
      )}>
        {list.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-purple-500/40 bg-purple-950/40 p-10 text-center text-sm text-purple-100/80">
            No orders in this section.
          </div>
        )}
        {list.map((o) => (
          <button
            key={o.id}
            onClick={() => navigate({ to: "/shop", search: { view: "orders", id: o.id, scope: scope === "all" ? "all" : undefined } })}
            className={cn(
              "text-left rounded-xl border p-4 transition backdrop-blur flex flex-col gap-2",
              selectedId === o.id
                ? "bg-fuchsia-600/15 border-fuchsia-400/60 shadow-[0_0_20px_-6px_rgba(232,121,249,0.5)]"
                : "bg-purple-950/50 border-purple-500/30 hover:border-fuchsia-400/40 hover:bg-purple-900/40",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-purple-200/70">#{o.id.slice(0, 8)}</span>
              <div className="flex items-center gap-1">
                {cryptoOrderIds.has(o.id) && (
                  <span
                    title={cryptoPendingIds.has(o.id) ? "Crypto invoice created (awaiting payment)" : "Paid via crypto"}
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded font-medium",
                      cryptoPendingIds.has(o.id)
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300",
                    )}
                  >₿</span>
                )}
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium capitalize", STATUS_COLOR[o.status] ?? "bg-purple-900/60 text-purple-100")}>{o.status}</span>
              </div>
            </div>
            <div className="font-display font-bold text-lg text-purple-50">{fmt(o.total_cents)}</div>
            <div className="text-[11px] text-purple-200/60">{new Date(o.created_at).toLocaleString()}</div>
            <div className="mt-auto pt-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] text-fuchsia-300 font-medium">
                <Package className="size-3" /> View details
              </span>
            </div>
          </button>
        ))}
      </div>
      <div className={cn("rounded-2xl bg-purple-950/40 border border-purple-500/30 backdrop-blur overflow-hidden min-h-[60vh] flex", selectedId ? "flex" : "hidden lg:flex")}>
        {selectedId ? (
          <OrderDetail
            orderId={selectedId}
            isAdmin={isAdmin && adminUnlocked}
            onBack={() => navigate({ to: "/shop", search: { view: "orders", scope: scope === "all" ? "all" : undefined } })}
          />
        ) : (
          <div className="flex-1 grid place-items-center text-purple-200/70 text-sm p-10 text-center">
            Select an order card to see all the details and status.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="flex-1 overflow-y-auto relative bg-cover bg-center bg-fixed min-h-screen"
      style={{ backgroundImage: `url(${shopOrdersBg})` }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[#1a0b2e]/85 via-[#1a0b2e]/65 to-[#1a0b2e]/90 backdrop-blur-[2px] pointer-events-none" aria-hidden />
      <header className="relative px-6 md:px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
          {scope === "all" ? "Shop Admin · Orders" : "Your Orders"}
        </h1>
        <p className="text-purple-200/80 mt-1">Every order in one place — full details, live status, and direct chat with our team.</p>
      </header>

      <div className="relative px-4 md:px-8 py-6">
        <Tabs value={ordersTab} onValueChange={(v) => setOrdersTab(v as "processing" | "completed" | "cancelled")} className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList className="grid grid-cols-3 w-full max-w-lg bg-purple-950/60 border border-purple-500/30">
              <TabsTrigger value="processing" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Processing ({processingOrders.length})</TabsTrigger>
              <TabsTrigger value="completed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Completed ({completedOrders.length})</TabsTrigger>
              <TabsTrigger value="cancelled" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Cancelled ({cancelledOrders.length})</TabsTrigger>
            </TabsList>
            {isAdmin && adminUnlocked && (
              <div className="flex bg-purple-950/60 border border-purple-500/30 rounded-md p-0.5 text-[11px]">
                <button onClick={() => setScope("mine")} className={cn("px-3 py-1 rounded text-purple-100", scope === "mine" && "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white")}>Mine</button>
                <button onClick={() => setScope("all")} className={cn("px-3 py-1 rounded text-purple-100", scope === "all" && "bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white")}>All</button>
              </div>
            )}
          </div>

          <TabsContent value="processing" className="mt-6">
            {renderOrderList(processingOrders)}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            {renderOrderList(completedOrders)}
          </TabsContent>

          <TabsContent value="cancelled" className="mt-6">
            {renderOrderList(cancelledOrders)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OrderDetail({ orderId, isAdmin, onBack }: { orderId: string; isAdmin: boolean; onBack?: () => void }) {
  // see component below
  return <OrderDetailImpl orderId={orderId} isAdmin={isAdmin} onBack={onBack} />;
}

function MyOrdersTab({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"processing" | "completed" | "cancelled">("processing");

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancel) return;
      const rows = (data ?? []) as Order[];
      setOrders(rows);
      if (rows.length > 0) {
        const { data: ts } = await supabase
          .from("tickets")
          .select("id,order_id")
          .in("order_id", rows.map((o) => o.id));
        if (!cancel) {
          const map: Record<string, string> = {};
          for (const t of (ts ?? []) as { id: string; order_id: string }[]) {
            if (t.order_id) map[t.order_id] = t.id;
          }
          setTickets(map);
        }
      }
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [user?.id]);

  const processingOrders = orders.filter((o) => ["pending", "processing", "paid"].includes(o.status));
  const completedOrders = orders.filter((o) => o.status === "completed");
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");

  const renderOrderCards = (list: Order[]) => (
    loading ? (
      <div className="grid place-items-center py-16 text-purple-200/70"><Loader2 className="size-5 animate-spin" /></div>
    ) : list.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-purple-500/40 bg-purple-950/40 p-10 text-center text-sm text-purple-100/80">
        No orders in this section.
      </div>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((o) => {
          const ticketId = tickets[o.id];
          return (
            <div
              key={o.id}
              className="bg-purple-950/50 border border-purple-500/30 backdrop-blur rounded-xl p-4 flex flex-col gap-2 hover:border-fuchsia-400/40 hover:bg-purple-900/40 transition"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-purple-200/70">#{o.id.slice(0, 8)}</span>
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium capitalize", STATUS_COLOR[o.status] ?? "bg-purple-900/60 text-purple-100")}>{o.status}</span>
              </div>
              <div className="font-display font-bold text-lg text-purple-50">{fmt(o.total_cents)}</div>
              <div className="text-[11px] text-purple-200/60">{new Date(o.created_at).toLocaleString()}</div>
              <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => onOpenOrder(o.id)}
                  className="px-3 py-1.5 rounded-md bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-medium hover:from-violet-500 hover:to-blue-500 inline-flex items-center gap-1"
                >
                  <Package className="size-3.5" /> View order
                </button>
                {ticketId && (
                  <button
                    onClick={() => navigate({ to: "/tickets", search: { id: ticketId } })}
                    className="px-3 py-1.5 rounded-md bg-purple-900/70 border border-purple-500/40 text-purple-50 text-xs font-medium hover:bg-purple-900 inline-flex items-center gap-1"
                  >
                    <Receipt className="size-3.5" /> Support ticket
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    )
  );

  return (
    <div className="relative -mx-6 overflow-hidden">
      <header className="relative px-6 md:px-8 pt-8 pb-6 border-b border-purple-500/30 bg-purple-950/40 backdrop-blur">
        <h1 className="font-display text-3xl font-bold bg-gradient-to-r from-violet-600 via-fuchsia-600 to-blue-600 bg-clip-text text-transparent">
          Your Orders
        </h1>
        <p className="text-purple-200/80 mt-1">Every order you've placed — full details, live status, and direct chat with our team.</p>
      </header>

      <div className="relative px-4 md:px-6 py-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "processing" | "completed" | "cancelled")} className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-lg bg-purple-950/60 border border-purple-500/30">
            <TabsTrigger value="processing" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Processing ({processingOrders.length})</TabsTrigger>
            <TabsTrigger value="completed" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Completed ({completedOrders.length})</TabsTrigger>
            <TabsTrigger value="cancelled" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-600 data-[state=active]:to-purple-600 data-[state=active]:text-white">Cancelled ({cancelledOrders.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="processing" className="mt-6">
            {renderOrderCards(processingOrders)}
          </TabsContent>

          <TabsContent value="completed" className="mt-6">
            {renderOrderCards(completedOrders)}
          </TabsContent>

          <TabsContent value="cancelled" className="mt-6">
            {renderOrderCards(cancelledOrders)}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function OrderDetailImpl({ orderId, isAdmin, onBack }: { orderId: string; isAdmin: boolean; onBack?: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [msgs, setMsgs] = useState<OrderMessage[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [othersTyping, setOthersTyping] = useState<Record<string, { isAdmin: boolean; at: number }>>({});
  const typingTimerRef = useRef<number | null>(null);
  const lastSentTypingRef = useRef(0);
  const typingChannelReadyRef = useRef(false);
  const textRef = useRef("");
  const [credsOpen, setCredsOpen] = useState(false);
  const [linkedTicketId, setLinkedTicketId] = useState<string | null>(null);

  // Look up the support ticket that was opened for this order so we can
  // redirect customers/staff there instead of using the legacy chat.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setLinkedTicketId((data as { id: string } | null)?.id ?? null);
    })();
    return () => { cancelled = true; };
  }, [orderId]);

  const load = async () => {
    const [{ data: o }, { data: it }, { data: m }] = await Promise.all([
      supabase.from("orders").select("*").eq("id", orderId).single(),
      supabase.from("order_items").select("*").eq("order_id", orderId),
      supabase.from("order_messages").select("*").eq("order_id", orderId).order("created_at"),
    ]);
    setOrder(o as Order | null); setItems(it ?? []); setMsgs(m ?? []);
  };
  useEffect(() => { load(); }, [orderId]);

  // Track active crypto invoice so we can lock out other payment methods
  // while the customer's USDT payment is on its way.
  const [pendingCrypto, setPendingCrypto] = useState<{ status: string } | null>(null);
  const [paidMethodLabel, setPaidMethodLabel] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loadPay = async () => {
      const { data } = await supabase
        .from("order_payments")
        .select("provider,status,card_brand,last_4")
        .eq("order_id", orderId)
        .maybeSingle();
      if (cancelled) return;
      const pending =
        data?.provider === "nowpayments" &&
        ["waiting", "confirming", "partially_paid", "sending", "pending"].includes(
          (data.status ?? "").toLowerCase(),
        );
      setPendingCrypto(pending ? { status: data!.status as string } : null);
      if (data && (data.status === "finished" || data.status === "COMPLETED" || data.status === "captured" || data.status === "paid")) {
        if (data.provider === "nowpayments") {
          setPaidMethodLabel(data.card_brand || "USDT");
        } else if (data.provider === "paypal") {
          setPaidMethodLabel(data.card_brand === "Card" ? "Card (PayPal)" : "PayPal");
        } else {
          setPaidMethodLabel(
            data.card_brand && data.last_4
              ? `${data.card_brand} •••• ${data.last_4}`
              : "Card",
          );
        }
      } else {
        setPaidMethodLabel(null);
      }
    };
    loadPay();
    const ch = supabase
      .channel(`orderpay-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => loadPay(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [orderId]);
  useEffect(() => {
    const ch = supabase.channel(`order-${orderId}`, { config: { broadcast: { self: false }, presence: { key: user?.id ?? "guest" } } })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` },
        (p) => {
          const nm = p.new as OrderMessage;
          setMsgs((m) => (m.some((x) => x.id === nm.id) ? m : [...m, nm]));
          // Stop showing typing for the sender of this new message
          setOthersTyping((s) => {
            if (!s[nm.sender_id]) return s;
            const next = { ...s }; delete next[nm.sender_id]; return next;
          });
        })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` },
        (p) => {
          const nm = p.new as OrderMessage;
          setMsgs((m) => m.map((x) => (x.id === nm.id ? nm : x)));
        })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "order_messages", filter: `order_id=eq.${orderId}` },
        (p) => {
          const old = p.old as { id?: string };
          if (old?.id) setMsgs((m) => m.filter((x) => x.id !== old.id));
        })
      .on("postgres_changes", { event: "UPDATE", schema: "private", table: "orders", filter: `id=eq.${orderId}` },
        // The realtime payload is the raw private row (encrypted columns);
        // refetch via the public view so decrypted fields stay populated.
        () => { void load(); })
      .on("broadcast", { event: "typing" }, (payload) => {
        const d = (payload?.payload ?? {}) as { userId?: string; isAdmin?: boolean; stopped?: boolean };
        if (!d.userId || d.userId === user?.id || !!d.isAdmin === isAdmin) return;
        setOthersTyping((s) => {
          if (d.stopped) {
            if (!s[d.userId!]) return s;
            const next = { ...s }; delete next[d.userId!]; return next;
          }
          return { ...s, [d.userId!]: { isAdmin: !!d.isAdmin, at: Date.now() } };
        });
      })
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState() as Record<string, Array<{ userId?: string; isAdmin?: boolean; typing?: boolean; at?: number }>>;
        const next: Record<string, { isAdmin: boolean; at: number }> = {};
        Object.values(state).flat().forEach((p) => {
          if (!p.userId || p.userId === user?.id || !p.typing || !!p.isAdmin === isAdmin) return;
          next[p.userId] = { isAdmin: !!p.isAdmin, at: p.at ?? Date.now() };
        });
        setOthersTyping(next);
      })
      .subscribe((status) => {
        typingChannelReadyRef.current = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") {
          load();
          if (textRef.current.trim()) sendTyping(false);
        }
      });
    channelRef.current = ch;
    return () => {
      typingChannelReadyRef.current = false;
      channelRef.current = null;
      if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      void ch.untrack();
      supabase.removeChannel(ch);
      setOthersTyping({});
    };
  }, [orderId, user?.id, isAdmin]);
  // Expire typing indicators after 4s of inactivity
  useEffect(() => {
    if (Object.keys(othersTyping).length === 0) return;
    const t = window.setInterval(() => {
      const now = Date.now();
      setOthersTyping((s) => {
        let changed = false;
        const next: typeof s = {};
        for (const [k, v] of Object.entries(s)) {
          if (now - v.at < 4000) next[k] = v; else changed = true;
        }
        return changed ? next : s;
      });
    }, 1000);
    return () => window.clearInterval(t);
  }, [othersTyping]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  function sendTyping(stopped: boolean) {
    if (!channelRef.current || !user || !typingChannelReadyRef.current) return;
    const now = Date.now();
    if (!stopped && now - lastSentTypingRef.current < 1500) return;
    if (!stopped) lastSentTypingRef.current = now;
    const payload = { userId: user.id, isAdmin, typing: !stopped, at: now, stopped };
    if (stopped) void channelRef.current.untrack();
    else void channelRef.current.track(payload);
    void channelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload,
    });
  }
  const onTextChange = (v: string) => {
    textRef.current = v;
    setText(v);
    if (v.trim().length === 0) {
      sendTyping(true);
      if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
      return;
    }
    sendTyping(false);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => sendTyping(true), 3000);
  };

  const send = async () => {
    if (!text.trim() || !user) return;
    const c = text; setText(""); textRef.current = "";
    if (typingTimerRef.current) { window.clearTimeout(typingTimerRef.current); typingTimerRef.current = null; }
    sendTyping(true);
    const { data, error } = await supabase
      .from("order_messages")
      .insert({ order_id: orderId, sender_id: user.id, content: c })
      .select()
      .single();
    if (error) { toast.error(error.message); setText(c); return; }
    if (data) setMsgs((m) => (m.some((x) => x.id === (data as OrderMessage).id) ? m : [...m, data as OrderMessage]));
  };

  const sendSystem = async (content: string) => {
    if (!user) return;
    // Order communication now lives in the linked support ticket. Post the
    // system message there so the customer + admin/management see it in one
    // place. Fall back to legacy order_messages only if no ticket is linked.
    if (linkedTicketId) {
      await supabase.from("ticket_messages").insert({
        ticket_id: linkedTicketId,
        sender_id: user.id,
        content,
      } as never);
    } else {
      await supabase.from("order_messages").insert({ order_id: orderId, sender_id: user.id, content });
    }
  };

  const acceptOrder = async () => {
    if (!order || order.status !== "pending" || !!order.completed_at) return;
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("orders").update({ status: "processing" } as never).eq("id", orderId);
      if (error) { toast.error(error.message); return; }
      await sendSystem(`✅ Order accepted — thank you for your order!`);
      toast.success("Order accepted");
    } finally { setBusy(false); }
  };

  const markPaid = async () => {
    if (!order || order.paid_at || order.status === "completed" || !!order.completed_at) return;
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("mark_order_paid" as never, { p_order_id: orderId } as never);
      if (error) { toast.error(error.message); return; }
      await load();
      toast.success("Marked as paid");
    } finally { setBusy(false); }
  };

  const settingUpAccount = async () => {
    if (!order || order.status === "completed" || !!order.completed_at) {
      toast.error("This order is completed and cannot be changed.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      let profileLink = "";
      if (order.user_id) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", order.user_id)
          .maybeSingle();
        const uname = (prof as { username?: string | null } | null)?.username;
        if (uname) profileLink = ` ${window.location.origin}/u/${uname}?tab=creds`;
      }
      await sendSystem(`🛠️ We are currently setting up your account. Your login details will appear in the Credentials section of your profile soon.${profileLink}`);
      toast.success("Customer notified");
      if (isAdmin && order.user_id) setCredsOpen(true);
    } finally { setBusy(false); }
  };

  const extendSubscription = async () => {
    if (!order || order.status === "completed" || !!order.completed_at) {
      toast.error("This order is completed and cannot be changed.");
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const handle = order.existing_username ? ` for @${order.existing_username}` : "";
      await sendSystem(`🔄 Your subscription${handle} is being updated. You'll receive confirmation once the extension is complete.`);
      toast.success("Customer notified");
    } finally { setBusy(false); }
  };

  const completeSale = async () => {
    if (!order || order.status === "completed" || !!order.completed_at) return;
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("orders").update({
        completed_at: new Date().toISOString(), completed_by: user?.id ?? null, status: "completed",
      } as never).eq("id", orderId);
      if (error) { toast.error(error.message); return; }
      await sendSystem(`🎉 Order complete — thank you for your business!`);
      toast.success("Sale completed");
    } finally { setBusy(false); }
  };

  const cancelOrder = async () => {
    if (!order) return;
    if (order.status === "completed" || !!order.completed_at || !!order.paid_at) {
      toast.error("This order can no longer be cancelled.");
      return;
    }
    if (order.status === "cancelled") return;
    if (!confirm("Cancel this order? This cannot be undone.")) return;
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" } as never)
        .eq("id", orderId);
      if (error) { toast.error(error.message); return; }
      await sendSystem(`🚫 Order cancelled by ${order.user_id === user?.id ? "customer" : "staff"}.`);
      toast.success("Order cancelled");
      await load();
    } finally { setBusy(false); }
  };

  const removeItem = async (itemId: string, productName: string) => {
    if (!order) return;
    const isOwner = order.user_id === user?.id;
    const canRemove = isAdmin
      ? order.status !== "completed" && !order.completed_at
      : isOwner && order.status === "pending" && !order.paid_at && !order.completed_at;
    if (!canRemove) {
      toast.error("This order can no longer be edited.");
      return;
    }
    if (items.length <= 1) {
      toast.error("Cannot remove the last item. Cancel the order instead.");
      return;
    }
    if (!confirm(`Remove "${productName}" from this order?`)) return;
    const { error } = await supabase.from("order_items").delete().eq("id", itemId);
    if (error) { toast.error(error.message); return; }
    await sendSystem(`🗑️ Removed "${productName}" from this order.`);
    toast.success("Item removed");
    load();
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
      <header className="min-h-14 px-3 md:px-6 py-2 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="md:hidden p-1.5 rounded-md hover:bg-surface-2" aria-label="Back to orders">
              <ArrowLeft className="size-4" />
            </button>
          )}
          <div className="min-w-0">
          <div className="font-display font-bold text-sm">Order #{order.id.slice(0, 8)}</div>
          <div className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleString()}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={handleDownload}
            className="px-2.5 py-1 rounded-md bg-surface-2 text-xs font-medium flex items-center gap-1 hover:bg-surface-2/80">
            <Download className="size-3.5" /> {order.paid_at ? "Receipt" : "Invoice"} PDF
          </button>
          {linkedTicketId && (
            <button
              onClick={() => navigate({ to: "/tickets", search: { id: linkedTicketId } })}
              className="px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1 hover:opacity-90"
            >
              <Receipt className="size-3.5" /> Support ticket
            </button>
          )}
          {isAdmin ? (
            <>
              <button onClick={markPaid} disabled={busy || !!order.paid_at || !!order.completed_at || order.status === "cancelled"}
                className="px-2.5 py-1 rounded-md bg-success/15 text-success text-xs font-medium flex items-center gap-1 hover:bg-success/25 disabled:opacity-50">
                <BadgeCheck className="size-3.5" /> {order.paid_at ? "Paid" : "Mark As Paid"}
                {order.paid_at && paidMethodLabel && (
                  <span className="ml-1 font-mono text-[11px] opacity-80">· {paidMethodLabel}</span>
                )}
              </button>
            </>
          ) : (
            <>
              <span className={cn("text-xs px-2 py-1 rounded font-medium", STATUS_COLOR[order.status])}>{order.status}</span>
              {order.user_id === user?.id && !order.paid_at && !order.completed_at && order.status !== "cancelled" && (
                <button onClick={cancelOrder} disabled={busy}
                  className="px-2.5 py-1 rounded-md bg-destructive/15 text-destructive text-xs font-medium flex items-center gap-1 hover:bg-destructive/25 disabled:opacity-50">
                  <Ban className="size-3.5" /> Cancel Order
                </button>
              )}
            </>
          )}
        </div>
      </header>
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        <div className="w-full flex-1 bg-surface/50 p-4 md:p-6 overflow-y-auto space-y-4 text-sm">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Items</div>
            <div className="space-y-1">
              {items.map((i) => (
                <div key={i.id} className="flex justify-between items-center gap-2 group">
                  <span className="min-w-0 flex-1 truncate">{i.product_name} <span className="text-muted-foreground">× {i.quantity}</span></span>
                  <span className="shrink-0">{fmt(i.unit_price_cents * i.quantity)}</span>
                  {((isAdmin && !order.completed_at) ||
                    (order.user_id === user?.id && order.status === "pending" && !order.paid_at && !order.completed_at)) && (
                    <button
                      onClick={() => removeItem(i.id, i.product_name)}
                      className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition"
                      title="Remove item"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
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
            {typeof order.wants_adult_content === "boolean" && (
              <div className="text-xs mt-1">
                <span className="text-muted-foreground">Adult content: </span>
                <span>{order.wants_adult_content ? "Yes" : "No"}</span>
              </div>
            )}
            {order.discount_code && (
              <div className="text-xs mt-1 text-muted-foreground">Discount: {order.discount_code} (-{fmt(order.discount_cents ?? 0)})</div>
            )}
            {order.paid_at && <div className="text-xs mt-1 text-success">Paid · {new Date(order.paid_at).toLocaleString()}</div>}
            {order.completed_at && <div className="text-xs text-primary">Completed · {new Date(order.completed_at).toLocaleString()}</div>}
          </div>
          {order.notes && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
              <div className="text-muted-foreground text-xs whitespace-pre-line">{order.notes}</div>
            </div>
          )}
          {order.user_id === user?.id && (
            <div className="space-y-3">
              {pendingCrypto ? (
                <>
                  <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-foreground">
                    <div className="font-medium mb-0.5">USDT payment in progress</div>
                    <div className="text-muted-foreground">
                      Awaiting on-chain confirmation ({pendingCrypto.status}). Other payment methods are locked until this clears. If you didn't send anything, wait for the invoice to expire or contact support.
                    </div>
                  </div>
                  <CryptoPanel
                    orderId={orderId}
                    amountCents={order.total_cents ?? 0}
                    canPay={false}
                    onChange={load}
                  />
                </>
              ) : order.paid_at || order.completed_at || order.status === "cancelled" ? (
                <>
                  <SquareCardPanel orderId={orderId} amountCents={order.total_cents ?? 0} canPay={false} onChange={load} />
                  <PaypalPanel orderId={orderId} amountCents={order.total_cents ?? 0} canPay={false} onChange={load} />
                  <CryptoPanel orderId={orderId} amountCents={order.total_cents ?? 0} canPay={false} onChange={load} />
                </>
              ) : (
                <PayOrderDialog
                  orderId={orderId}
                  amountCents={order.total_cents ?? 0}
                  onChange={load}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {credsOpen && order.user_id && (
        <AddCredentialDialog
          ownerId={order.user_id}
          currentUserId={user?.id ?? ""}
          onClose={() => setCredsOpen(false)}
          onSaved={async () => {
            setCredsOpen(false);
            await sendSystem(`🔐 Your login details have been added to the Credentials section of your profile.`);
          }}
        />
      )}
    </main>
  );
}

function AddCredentialDialog({
  ownerId, currentUserId, onClose, onSaved,
}: {
  ownerId: string;
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [appLoginName, setAppLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
    let out = "";
    const buf = new Uint32Array(16);
    crypto.getRandomValues(buf);
    for (let i = 0; i < 16; i++) out += chars[buf[i] % chars.length];
    setPassword(out);
  };

  const save = async () => {
    if (!appLoginName || !password) return toast.error("Name and password required");
    setBusy(true);
    try {
      const payload = {
        app_login_name: appLoginName,
        password,
        owner_id: ownerId,
        expiry_at: expiry ? new Date(expiry).toISOString() : null,
        notes: notes || null,
        created_by: currentUserId,
      };
      const { error } = await supabase.from("app_credentials").insert(payload as never);
      if (error) throw error;
      toast.success("Credential successfully added");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save credential");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add credential</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">App login name</label>
            <input value={appLoginName} onChange={(e) => setAppLoginName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm outline-none border border-border focus:border-primary"
              placeholder="e.g. IPTV portal" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
            <div className="flex gap-2">
              <input value={password} onChange={(e) => setPassword(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-surface-2 text-sm font-mono outline-none border border-border focus:border-primary" />
              <button type="button" onClick={generate}
                className="px-3 py-2 rounded-lg border border-border text-xs whitespace-nowrap hover:border-primary">
                Generate
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Expiry (optional)</label>
            <input type="datetime-local" value={expiry} onChange={(e) => setExpiry(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm outline-none border border-border focus:border-primary" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full px-3 py-2 rounded-lg bg-surface-2 text-sm outline-none border border-border focus:border-primary resize-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm">Cancel</button>
          <button onClick={save} disabled={busy}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium flex items-center gap-2 disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ ADMIN ============
function AdminProducts() {
  return <AdminProductsInner />;
}

export function PayOrderDialog({ orderId, amountCents, onChange }: { orderId: string; amountCents: number; onChange?: () => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const handleChange = async () => {
    await onChange?.();
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 transition"
      >
        <CreditCard className="size-4" />
        Pay {fmt(amountCents)}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose how to pay</DialogTitle>
            <div className="text-sm text-muted-foreground">Total {fmt(amountCents)}</div>
          </DialogHeader>
          <Tabs defaultValue="square" className="pt-2">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="square">Square</TabsTrigger>
              <TabsTrigger value="paypal">PayPal</TabsTrigger>
              <TabsTrigger value="usdt">USDT</TabsTrigger>
            </TabsList>
            <TabsContent value="square" className="mt-3">
              <SquareCardPanel orderId={orderId} amountCents={amountCents} canPay={true} onChange={handleChange} />
            </TabsContent>
            <TabsContent value="paypal" className="mt-3">
              <PaypalPanel orderId={orderId} amountCents={amountCents} canPay={true} onChange={handleChange} />
            </TabsContent>
            <TabsContent value="usdt" className="mt-3">
              <CryptoPanel orderId={orderId} amountCents={amountCents} canPay={true} onChange={handleChange} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </>
  );
}
declare global {
  interface Window { Square?: any }
}

function loadSquareSdk(env: "sandbox" | "production"): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Square) return Promise.resolve(window.Square);
  const id = "square-web-sdk";
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  const src = env === "sandbox"
    ? "https://sandbox.web.squarecdn.com/v1/square.js"
    : "https://web.squarecdn.com/v1/square.js";
  return new Promise((resolve, reject) => {
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Square));
      existing.addEventListener("error", () => reject(new Error("Failed to load Square SDK")));
      if (window.Square) resolve(window.Square);
      return;
    }
    const s = document.createElement("script");
    s.id = id; s.src = src; s.async = true;
    s.onload = () => resolve(window.Square);
    s.onerror = () => reject(new Error("Failed to load Square SDK"));
    document.head.appendChild(s);
  });
}

function SquareLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="Square">
      <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="6" ry="6" fill="#000000" />
        <rect x="10" y="10" width="12" height="12" rx="2" ry="2" fill="#ffffff" />
      </svg>
      <span className="text-[13px] font-semibold tracking-tight text-foreground leading-none">Square</span>
    </span>
  );
}

function SquareCardPanel({ orderId, amountCents, canPay, onChange }: { orderId: string; amountCents: number; canPay: boolean; onChange?: () => void | Promise<void> }) {
  const [paid, setPaid] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cardInstanceRef = useRef<any>(null);
  const paymentsRef = useRef<any>(null);
  const googlePayBtnRef = useRef<HTMLDivElement | null>(null);
  const googlePayInstanceRef = useRef<any>(null);
  const [googlePayReady, setGooglePayReady] = useState(false);
  const { format } = useCurrency();
  const getConfig = useServerFn(getSquareWebConfig);
  const chargeFn = useServerFn(chargeOrderWithSquare);

  const loadPayment = async () => {
    const { data } = await supabase.from("order_payments").select("*").eq("order_id", orderId).maybeSingle();
    setPaid(data);
  };

  useEffect(() => { loadPayment(); }, [orderId]);
  useEffect(() => {
    const ch = supabase.channel(`op-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => loadPayment())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    if (!canPay || paid || !open) return;
    (async () => {
      try {
        const cfg = await getConfig();
        const Square = await loadSquareSdk(cfg.environment);
        if (cancelled) return;
        const payments = Square.payments(cfg.applicationId, cfg.locationId);
        paymentsRef.current = payments;
        const card = await payments.card();
        if (cancelled) { try { card.destroy(); } catch {} return; }
        if (cardRef.current) {
          await card.attach(cardRef.current);
          cardInstanceRef.current = card;
          setReady(true);
        }
        // Wallet payment request (shared by Apple Pay + Google Pay)
        const buildPaymentRequest = () => payments.paymentRequest({
          countryCode: "GB",
          currencyCode: "GBP",
          total: { amount: (amountCents / 100).toFixed(2), label: "Total" },
        });
        // Google Pay
        try {
          const gpReq = buildPaymentRequest();
          const gp = await payments.googlePay(gpReq);
          if (cancelled) { try { gp.destroy(); } catch {} }
          else if (googlePayBtnRef.current) {
            await gp.attach(googlePayBtnRef.current, { buttonType: "pay", buttonSizeMode: "fill" });
            googlePayInstanceRef.current = gp;
            setGooglePayReady(true);
          }
        } catch (e) {
          console.warn("[square] Google Pay unavailable", e);
        }
      } catch (e) {
        if (!cancelled) setBootError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      try { cardInstanceRef.current?.destroy(); } catch {}
      cardInstanceRef.current = null;
      try { googlePayInstanceRef.current?.destroy(); } catch {}
      googlePayInstanceRef.current = null;
      setReady(false);
      setGooglePayReady(false);
    };
  }, [canPay, paid, orderId, amountCents, open]);

  const tokenizeAndCharge = async (instance: any, label: string) => {
    if (!instance) return;
    setLoading(true);
    try {
      const result = await instance.tokenize();
      if (result.status !== "OK") {
        // Apple/Google Pay user-cancel comes through here too — silence it.
        if (result.status === "Cancel") return;
        const msg = result.errors?.[0]?.message || `${label} tokenization failed`;
        throw new Error(msg);
      }
      const res = await chargeFn({ data: { orderId, sourceId: result.token } });
      toast.success(`Paid ${format(amountCents)}`);
      setPaid({
        status: res.status,
        card_brand: res.cardBrand,
        last_4: res.last4,
        receipt_url: res.receiptUrl,
        amount_cents: amountCents,
      });
      setOpen(false);
      await onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const handlePay = () => tokenizeAndCharge(cardInstanceRef.current, "Card");
  const handleGooglePay = () => tokenizeAndCharge(googlePayInstanceRef.current, "Google Pay");

  if (paid) {
    // Paid via PayPal — let the PayPal panel render the confirmation instead.
    if (paid.provider === "paypal") return null;
    // Paid via crypto/NOWPayments — hide the Square block; the order header
    // already shows the paid method and the CryptoPanel renders its own
    // confirmation.
    if (paid.provider === "nowpayments") return null;
    return (
      <div>
        <SquareLogo className="mb-1.5" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Card Payment via Square</div>
        <div className="rounded-md bg-success/10 border border-success/20 px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-2 text-success text-xs font-medium">
            <CreditCard className="size-3.5" /> Paid
            {paid.card_brand && paid.last_4 && (
              <span className="font-mono text-muted-foreground">{paid.card_brand} •••• {paid.last_4}</span>
            )}
          </div>
          {paid.receipt_url && (
            <a href={paid.receipt_url} target="_blank" rel="noreferrer"
              className="text-[11px] text-primary hover:underline">View receipt</a>
          )}
        </div>
      </div>
    );
  }

  if (!canPay) return null;

  return (
    <div>
      <SquareLogo className="mb-1.5" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pay by card</div>
      <button
        onClick={() => setOpen(true)}
        className="w-full px-2.5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90"
      >
        <CreditCard className="size-3.5" />
        Pay {format(amountCents)} by card
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><SquareLogo /> Card Payment</DialogTitle>
          </DialogHeader>
          {bootError ? (
            <div className="text-xs text-destructive">{bootError}</div>
          ) : (
            <div className="space-y-3">
              {googlePayReady && (
                <div className="space-y-1.5">
                  <div ref={googlePayBtnRef} onClick={handleGooglePay}
                    className="w-full min-h-[44px] cursor-pointer" aria-disabled={loading} />
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <div className="flex-1 h-px bg-border" /> or pay by card <div className="flex-1 h-px bg-border" />
                  </div>
                </div>
              )}
              <div ref={cardRef} className="rounded-md bg-surface-2 border border-border px-2 py-2 min-h-[60px]" />
              <button onClick={handlePay} disabled={!ready || loading}
                className="w-full px-2.5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50">
                <CreditCard className="size-3.5" />
                {loading ? "Processing…" : ready ? `Pay ${format(amountCents)}` : "Loading…"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaypalLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label="PayPal">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path d="M7.5 21h2.4l.6-3.6h2.1c3.3 0 5.7-1.8 6.3-5 .3-1.5 0-2.7-.8-3.5-.9-.9-2.4-1.4-4.3-1.4H9.3c-.4 0-.8.3-.9.7L6.6 20.3c-.1.4.2.7.6.7h.3z" fill="#003087"/>
        <path d="M9 17.4l.6-3.6h2.1c3.3 0 5.7-1.8 6.3-5 .1-.4.1-.8.1-1.1.6.3 1.1.8 1.4 1.4.8.8 1 2 .8 3.5-.6 3.2-3 5-6.3 5h-2.1l-.6 3.6h-2z" fill="#009cde"/>
        <path d="M9.3 7.5h4.5c1.9 0 3.4.5 4.3 1.4.3.3.6.7.7 1.1-.8-.4-1.7-.6-2.7-.6h-4c-.4 0-.8.3-.9.7l-.7 4.4-.6 3.6H7.5c-.4 0-.7-.3-.6-.7l1.5-9.2c.1-.4.5-.7.9-.7z" fill="#012169"/>
      </svg>
      <span className="text-[13px] font-semibold tracking-tight leading-none">
        <span style={{ color: "#003087" }}>Pay</span><span style={{ color: "#009cde" }}>Pal</span>
      </span>
    </span>
  );
}

function loadPaypalSdk(clientId: string, currency: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.paypal) { resolve(w.paypal); return; }
    const existing = document.querySelector<HTMLScriptElement>("script[data-paypal-sdk]");
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).paypal));
      existing.addEventListener("error", () => reject(new Error("Failed to load PayPal SDK")));
      return;
    }
    const s = document.createElement("script");
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=${encodeURIComponent(currency)}&intent=capture&components=buttons,card-fields`;
    s.async = true;
    s.setAttribute("data-paypal-sdk", "1");
    s.onload = () => resolve((window as any).paypal);
    s.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(s);
  });
}

function PaypalPanel({ orderId, amountCents, canPay, onChange }: { orderId: string; amountCents: number; canPay: boolean; onChange?: () => void | Promise<void> }) {
  const [paid, setPaid] = useState<any | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonsInstanceRef = useRef<any>(null);
  const cardNumberRef = useRef<HTMLDivElement | null>(null);
  const cardExpiryRef = useRef<HTMLDivElement | null>(null);
  const cardCvvRef = useRef<HTMLDivElement | null>(null);
  const cardNameRef = useRef<HTMLDivElement | null>(null);
  const cardFieldsRef = useRef<any>(null);
  const [cardReady, setCardReady] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const { format } = useCurrency();
  const getConfig = useServerFn(getPaypalWebConfig);
  const createFn = useServerFn(createPaypalOrder);
  const captureFn = useServerFn(capturePaypalOrder);

  const loadPayment = async () => {
    const { data } = await supabase.from("order_payments").select("*").eq("order_id", orderId).maybeSingle();
    setPaid(data);
  };
  useEffect(() => { loadPayment(); }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    if (!canPay || paid) return;
    (async () => {
      try {
        const cfg = await getConfig();
        const paypal = await loadPaypalSdk(cfg.clientId, cfg.currency);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = "";
        const btns = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal", height: 40 },
          createOrder: async () => {
            const res = await createFn({ data: { orderId } });
            return res.paypalOrderId;
          },
          onApprove: async (data: any) => {
            try {
              const res = await captureFn({ data: { orderId, paypalOrderId: data.orderID } });
              toast.success(`Paid ${format(amountCents)} via PayPal`);
              setPaid({
                status: res.status,
                card_brand: "PayPal",
                last_4: res.payerEmail ?? null,
                amount_cents: amountCents,
                provider: "paypal",
              });
              await onChange?.();
            } catch (e) {
              toast.error((e as Error).message);
            }
          },
          onCancel: () => { /* silent */ },
          onError: (err: any) => {
            console.error("[paypal] button error", err);
            toast.error(err?.message || "PayPal error");
          },
        });
        if (!btns.isEligible || !btns.isEligible()) {
          setBootError("PayPal not available for this browser/region.");
          return;
        }
        await btns.render(containerRef.current);
        buttonsInstanceRef.current = btns;
        setReady(true);

        // Advanced Card Fields (embedded in our own UI)
        try {
          if (typeof paypal.CardFields !== "function") return;
          const cf = paypal.CardFields({
            createOrder: async () => {
              const res = await createFn({ data: { orderId } });
              return res.paypalOrderId;
            },
            onApprove: async (data: any) => {
              try {
                const res = await captureFn({ data: { orderId, paypalOrderId: data.orderID } });
                toast.success(`Paid ${format(amountCents)} via card`);
                setPaid({
                  status: res.status,
                  card_brand: "Card",
                  last_4: null,
                  amount_cents: amountCents,
                  provider: "paypal",
                });
                await onChange?.();
              } catch (e) {
                toast.error((e as Error).message);
              }
            },
            onError: (err: any) => {
              console.error("[paypal] card-fields error", err);
              toast.error(err?.message || "Card error");
            },
            style: {
              input: {
                "font-size": "14px",
                "font-family": "Inter, system-ui, sans-serif",
                color: "#0f172a",
                "padding": "8px",
              },
              ".invalid": { color: "#dc2626" },
            },
          });
          if (!cf.isEligible()) return;
          if (cancelled) return;
          await Promise.all([
            cardNumberRef.current ? cf.NumberField().render(cardNumberRef.current) : null,
            cardExpiryRef.current ? cf.ExpiryField().render(cardExpiryRef.current) : null,
            cardCvvRef.current ? cf.CVVField().render(cardCvvRef.current) : null,
            cardNameRef.current ? cf.NameField().render(cardNameRef.current) : null,
          ]);
          cardFieldsRef.current = cf;
          if (!cancelled) setCardReady(true);
        } catch (e) {
          console.warn("[paypal] card-fields unavailable", e);
        }
      } catch (e) {
        if (!cancelled) setBootError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      try { buttonsInstanceRef.current?.close?.(); } catch {}
      buttonsInstanceRef.current = null;
      try { cardFieldsRef.current?.close?.(); } catch {}
      cardFieldsRef.current = null;
      setReady(false);
      setCardReady(false);
    };
  }, [canPay, paid, orderId, amountCents]);

  const handleCardPay = async () => {
    if (!cardFieldsRef.current) return;
    setCardLoading(true);
    try {
      await cardFieldsRef.current.submit();
    } catch (e: any) {
      toast.error(e?.message || "Card payment failed");
    } finally {
      setCardLoading(false);
    }
  };

  if (paid?.provider === "paypal") {
    return (
      <div>
        <PaypalLogo className="mb-1.5" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pay with PayPal</div>
        <div className="rounded-md bg-success/10 border border-success/20 px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-2 text-success text-xs font-medium">
            <CreditCard className="size-3.5" /> Paid
            {paid.last_4 && <span className="font-mono text-muted-foreground">{paid.last_4}</span>}
          </div>
        </div>
      </div>
    );
  }

  // Square already paid — hide PayPal entirely
  if (paid) return null;

  if (!canPay) return null;

  return (
    <div>
      <PaypalLogo className="mb-1.5" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pay with PayPal</div>
      {bootError ? (
        <div className="text-xs text-destructive">{bootError}</div>
      ) : (
        <>
          <div ref={containerRef} className="min-h-[40px]" />
          {!ready && <div className="text-[11px] text-muted-foreground mt-1">Loading PayPal…</div>}
          {cardReady && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div className="h-px flex-1 bg-border" /> or pay by card <div className="h-px flex-1 bg-border" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Cardholder name</label>
                <div ref={cardNameRef} className="rounded-md bg-white border border-border px-2 min-h-[40px]" />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground">Card number</label>
                <div ref={cardNumberRef} className="rounded-md bg-white border border-border px-2 min-h-[40px]" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground">Expiry</label>
                  <div ref={cardExpiryRef} className="rounded-md bg-white border border-border px-2 min-h-[40px]" />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground">CVV</label>
                  <div ref={cardCvvRef} className="rounded-md bg-white border border-border px-2 min-h-[40px]" />
                </div>
              </div>
              <button
                onClick={handleCardPay}
                disabled={cardLoading}
                className="w-full px-2.5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                <CreditCard className="size-3.5" />
                {cardLoading ? "Processing…" : `Pay ${format(amountCents)}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdminProductsInner() {
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
  const [products, setProducts] = useState<{ id: string; name: string; is_active: boolean }[]>([]);
  const [editing, setEditing] = useState<Partial<DiscountCodeWithProducts> | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [percentInput, setPercentInput] = useState("");
  const [amountInput, setAmountInput] = useState("");

  useEffect(() => {
    if (editing) {
      setPercentInput(editing.percent != null ? String(editing.percent) : "");
      setAmountInput(editing.amount_cents != null ? (editing.amount_cents / 100).toFixed(2) : "");
      if (editing.id) {
        supabase
          .from("discount_code_products")
          .select("product_id")
          .eq("discount_code_id", editing.id)
          .then(({ data }) => setSelectedProductIds((data ?? []).map((r: { product_id: string }) => r.product_id)));
      } else {
        setSelectedProductIds([]);
      }
      setProductQuery("");
    } else {
      setPercentInput("");
      setAmountInput("");
      setSelectedProductIds([]);
    }
  }, [editing?.id, editing]);

  const load = async () => {
    const { data } = await supabase.from("discount_codes").select("*").order("created_at", { ascending: false });
    setCodes((data ?? []) as DiscountCode[]);
  };
  useEffect(() => {
    load();
    supabase.from("profiles").select("id,username,display_name").order("username").then(({ data }) => setUsers(data ?? []));
    supabase.from("products").select("id,name,is_active").order("name").then(({ data }) => setProducts((data ?? []) as { id: string; name: string; is_active: boolean }[]));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("admin-discounts-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "discount_codes" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "discount_code_products" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
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
    let codeId = editing.id;
    if (codeId) {
      const { error } = await supabase.from("discount_codes").update(payload).eq("id", codeId);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("discount_codes").insert(payload).select("id").single();
      if (error || !data) { toast.error(error?.message ?? "Failed to save"); return; }
      codeId = data.id;
    }
    // Sync product restrictions
    await supabase.from("discount_code_products").delete().eq("discount_code_id", codeId);
    if (selectedProductIds.length > 0) {
      const rows = selectedProductIds.map((pid) => ({ discount_code_id: codeId!, product_id: pid }));
      const { error: linkErr } = await supabase.from("discount_code_products").insert(rows);
      if (linkErr) { toast.error(linkErr.message); return; }
    }
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
              <Field label={`Applies to products (${selectedProductIds.length === 0 ? "all products" : `${selectedProductIds.length} selected`})`}>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                      placeholder="Search products…"
                      className="flex-1 px-3 py-2 rounded-lg bg-surface-2 text-sm border border-border outline-none"
                    />
                    {selectedProductIds.length > 0 && (
                      <button type="button" onClick={() => setSelectedProductIds([])} className="text-xs text-muted-foreground underline">Clear</button>
                    )}
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-surface-2 divide-y divide-border">
                    {products
                      .filter((p) => !productQuery.trim() || p.name.toLowerCase().includes(productQuery.toLowerCase()))
                      .map((p) => {
                        const checked = selectedProductIds.includes(p.id);
                        return (
                          <label key={p.id} className="flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-surface">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelectedProductIds((prev) =>
                                  e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id),
                                );
                              }}
                            />
                            <span className={cn("flex-1", !p.is_active && "text-muted-foreground")}>{p.name}{!p.is_active && " (inactive)"}</span>
                          </label>
                        );
                      })}
                    {products.length === 0 && (
                      <div className="p-3 text-xs text-muted-foreground text-center">No products yet.</div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Leave empty to allow this code on all products.</p>
                </div>
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

function UsdtLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="USDT">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#26A17B" />
        <path d="M13.3 10.9V9.5h3.2V7.4H7.5v2.1h3.2v1.4c-2.6.1-4.6.6-4.6 1.2 0 .6 2 1.1 4.6 1.2v4.5h2.6v-4.5c2.6-.1 4.6-.6 4.6-1.2 0-.6-2-1.1-4.6-1.2zm0 2v0c-.1 0-.7.1-1.9.1-1 0-1.7-.1-1.9-.1v0c-2.2-.1-3.8-.5-3.8-.9 0-.5 1.6-.8 3.8-.9v1.5c.2 0 .9.1 1.9.1 1.2 0 1.8-.1 1.9-.1v-1.5c2.2.1 3.8.4 3.8.9 0 .4-1.6.8-3.8.9z" fill="#fff" />
      </svg>
      <span className="text-xs font-semibold tracking-tight">USDT</span>
    </span>
  );
}

function CryptoPanel({ orderId, amountCents, canPay, onChange }: { orderId: string; amountCents: number; canPay: boolean; onChange?: () => void | Promise<void> }) {
  const [paid, setPaid] = useState<any | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [network] = useState<string>("ERC20");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [invoice, setInvoice] = useState<{ url: string; id: string } | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  const [bootError, setBootError] = useState<string | null>(null);
  const { format } = useCurrency();
  const getCfg = useServerFn(getCryptoConfig);
  const createInvoice = useServerFn(createCryptoInvoice);
  const checkStatus = useServerFn(getCryptoInvoiceStatus);

  const loadPayment = async () => {
    const { data } = await supabase.from("order_payments").select("*").eq("order_id", orderId).maybeSingle();
    setPaid(data);
  };

  useEffect(() => { loadPayment(); }, [orderId]);
  useEffect(() => {
    const ch = supabase.channel(`opcrypto-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => loadPayment())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cfg = await getCfg();
        if (cancelled) return;
        setEnabled(cfg.enabled);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Poll for status while dialog is open
  useEffect(() => {
    if (!open || !invoice) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await checkStatus({ data: { orderId } });
        if (stopped) return;
        if (res.paid) {
          toast.success(`Paid ${format(amountCents)} via USDT`);
          setOpen(false);
          setInvoice(null);
          await loadPayment();
          await onChange?.();
        }
      } catch {/* ignore */}
    };
    const handle = setInterval(tick, 5000);
    return () => { stopped = true; clearInterval(handle); };
  }, [open, invoice, orderId, amountCents]);

  const startPayment = async () => {
    setLoading(true);
    setBootError(null);
    try {
      const res = await createInvoice({ data: { orderId, network: network as any } });
      setInvoice({ url: res.invoiceUrl, id: res.invoiceId });
      setExpiresAt(res.expiresAt ? new Date(res.expiresAt).getTime() : Date.now() + 24 * 60 * 60 * 1000);
      setOpen(true);
      try { window.open(res.invoiceUrl, "_blank", "noopener,noreferrer"); } catch {}
    } catch (e) {
      setBootError((e as Error).message);
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // 1s ticker while the dialog is open so the countdown updates live
  useEffect(() => {
    if (!open || !expiresAt) return;
    setNow(Date.now());
    const h = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(h);
  }, [open, expiresAt]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : 0;
  const fmtCountdown = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  if (paid?.provider === "nowpayments") {
    return (
      <div>
        <UsdtLogo className="mb-1.5" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pay with USDT</div>
        <div className="rounded-md bg-success/10 border border-success/20 px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-2 text-success text-xs font-medium">
            <CreditCard className="size-3.5" /> {paid.status === "finished" ? "Paid" : `Status: ${paid.status}`}
            {paid.card_brand && <span className="font-mono text-muted-foreground">{paid.card_brand}</span>}
            {paid.last_4 && <span className="font-mono text-muted-foreground">tx …{paid.last_4}</span>}
          </div>
          {paid.status !== "finished" && paid.receipt_url && canPay && (
            <a
              href={paid.receipt_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-[11px] underline text-success hover:text-success/80"
            >
              Open existing invoice
            </a>
          )}
        </div>
      </div>
    );
  }

  if (paid) return null; // paid via another provider
  if (enabled === false) return null;

  if (!canPay) return null;

  return (
    <div>
      <UsdtLogo className="mb-1.5" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pay with USDT</div>
      <div className="text-[11px] text-muted-foreground mb-2">Network: USDT ERC20 (Ethereum)</div>
      {bootError && <div className="text-xs text-destructive mb-2">{bootError}</div>}
      <button
        onClick={startPayment}
        disabled={loading || enabled === null}
        className="w-full px-2.5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
      >
        <UsdtLogo />
        {loading ? "Creating invoice…" : `Pay ${format(amountCents)} with USDT`}
      </button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setInvoice(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UsdtLogo /> USDT Payment ({network})</DialogTitle>
          </DialogHeader>
          {invoice ? (
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2 flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Invoice expires in</span>
                <span className={`font-mono text-sm font-semibold tabular-nums ${remainingMs < 60 * 60 * 1000 ? "text-destructive" : "text-foreground"}`}>
                  {remainingMs > 0 ? fmtCountdown(remainingMs) : "Expired"}
                </span>
              </div>
              <p className="text-sm text-foreground">
                Your USDT (ERC20) checkout has opened in a new tab. If it didn't, use the button below.
              </p>
              <a
                href={invoice.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
              >
                <UsdtLogo /> Open USDT checkout
              </a>
              <div className="text-[11px] text-muted-foreground border-t border-border pt-2">
                Waiting for on-chain confirmation. This window will close automatically once payment is detected. You can safely leave this page open.
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">Loading invoice…</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

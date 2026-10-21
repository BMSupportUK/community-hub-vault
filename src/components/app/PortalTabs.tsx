import { Link, useLocation } from "@tanstack/react-router";
import { KeyRound, Package, ShoppingCart, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "shop" | "orders" | "logins" | "guides";

/** Customer Portal tab bar shown above the Shop, My Orders, My Logins and Install Guides pages. */
export function PortalTabs({ active }: { active?: Tab }) {
  const location = useLocation();
  const view = (location.search as { view?: string }).view;
  const current: Tab = active ?? (location.pathname.startsWith("/install-guides") ? "guides" : location.pathname.startsWith("/portal") ? "logins" : view === "orders" ? "orders" : "shop");
  const item = "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const on = "bg-primary text-primary-foreground shadow";
  const off = "text-muted-foreground hover:bg-surface-2 hover:text-foreground";
  return (
    <nav aria-label="Customer Portal" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface/80 px-3 py-2 backdrop-blur sm:px-6">
      <span className="mr-2 hidden shrink-0 font-display text-sm font-bold sm:inline">Customer Portal</span>
      <Link to="/shop" className={cn(item, current === "shop" ? on : off)}><ShoppingCart className="size-4" />Shop</Link>
      <Link to="/shop" search={{ view: "orders" }} className={cn(item, current === "orders" ? on : off)}><Package className="size-4" />My Orders</Link>
      <Link to="/portal/logins" className={cn(item, current === "logins" ? on : off)}><KeyRound className="size-4" />My Logins</Link>
      <Link to="/install-guides" className={cn(item, current === "guides" ? on : off)}><Wrench className="size-4" />Install Guides</Link>
    </nav>
  );
}

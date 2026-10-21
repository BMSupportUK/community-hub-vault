import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Home, BookOpen, Settings, Trophy, KeyRound, Package, ShoppingCart, Ticket, Timer, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { usePortalUnlocked } from "@/components/app/PortalLock";
import { PortalUnlockButton } from "@/components/app/PortalUnlockButton";
import { PORTAL_EXPIRY_KEY, portalCountdown, portalSecondsRemaining } from "@/lib/customer-portal";

type Tab = "home" | "shop" | "orders" | "tickets" | "logins" | "guides" | "referrals" | "knowledge" | "settings";

/** Customer Portal tab bar shown above the Shop, My Orders, Tickets, My Logins and Install Guides pages. */
export function PortalTabs({ active }: { active?: Tab }) {
  const location = useLocation();
  const { isStaff } = useAuth();
  const unlocked = usePortalUnlocked();
  const showLinks = isStaff || unlocked;
  const view = (location.search as { view?: string }).view;
  const p = location.pathname;
  const current: Tab = active ?? (p.startsWith("/install-guides") ? "guides" : p.startsWith("/knowledge-base") ? "knowledge" : p.startsWith("/leaderboard") ? "referrals" : p.startsWith("/tickets") ? "tickets" : p.startsWith("/portal/settings") ? "settings" : p === "/portal" || p === "/portal/" ? "home" : p.startsWith("/portal") ? "logins" : view === "orders" ? "orders" : "shop");
  const item = "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors";
  const on = "bg-primary text-primary-foreground shadow";
  const off = "text-muted-foreground hover:bg-surface-2 hover:text-foreground";
  return (
    <nav aria-label="Customer Portal" className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface/80 px-3 py-2 backdrop-blur sm:px-6">
      <span className="mr-2 hidden shrink-0 font-display text-sm font-bold text-foreground sm:inline">Customer Portal</span>
      <Link to="/portal" className={cn(item, current === "home" ? on : off)}><Home className="size-4" />Home</Link>
      {!isStaff && !unlocked && <PortalUnlockButton />}
      {showLinks && (<>
      <Link to="/shop" className={cn(item, current === "shop" ? on : off)}><ShoppingCart className="size-4" />Shop</Link>
      <Link to="/shop" search={{ view: "orders" }} className={cn(item, current === "orders" ? on : off)}><Package className="size-4" />My Orders</Link>
      <Link to="/tickets" className={cn(item, current === "tickets" ? on : off)}><Ticket className="size-4" />Tickets</Link>
      <Link to="/portal/logins" className={cn(item, current === "logins" ? on : off)}><KeyRound className="size-4" />My Logins</Link>
      <Link to="/install-guides" search={{ tab: undefined, checkout: undefined }} className={cn(item, current === "guides" ? on : off)}><Wrench className="size-4" />Install Guides</Link>
      <Link to="/knowledge-base" className={cn(item, current === "knowledge" ? on : off)}><BookOpen className="size-4" />Knowledge Base</Link>
      <Link to="/leaderboard" className={cn(item, current === "referrals" ? on : off)}><Trophy className="size-4" />Referrals</Link>
      <Link to="/portal/settings" search={{ tab: undefined }} className={cn(item, current === "settings" ? on : off)}><Settings className="size-4" />Settings</Link>
      </>)}
      <PortalCountdown />
    </nav>
  );
}

function PortalCountdown() {
  const { isStaff } = useAuth();
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => { try { setLeft(portalSecondsRemaining(window.localStorage.getItem(PORTAL_EXPIRY_KEY))); } catch { setLeft(0); } };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  if (isStaff || !left) return null;
  const low = left <= 300;
  return (
    <div role="timer" aria-label="Portal access remaining" className={cn("ml-auto inline-flex shrink-0 items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-bold shadow-lg", low ? "animate-pulse border-destructive bg-destructive text-destructive-foreground" : "border-primary bg-primary/15 text-foreground shadow-primary/30")}>
      <Timer className={cn("size-4", !low && "text-primary")} />
      <span className="hidden sm:inline">Locks in</span>
      <time className="font-mono text-base tabular-nums">{portalCountdown(left)}</time>
    </div>
  );
}

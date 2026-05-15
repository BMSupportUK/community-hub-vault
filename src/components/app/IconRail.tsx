import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Ticket, ShoppingBag, BookOpen, FileText, Clock, Calendar, Shield, LogOut, MessageSquare, ShieldCheck, LayoutDashboard, UserCircle2, Globe, Activity, Briefcase, Star } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/app/NotificationBell";
import { MentionsBadge } from "@/components/app/MentionsBadge";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface RailItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  badge?: number;
}

export function IconRail() {
  const { isStaff, isMod, isPending, signOut, hasAny, roles } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [order, setOrder] = useState<Record<string, number>>({});
  const [pagePerms, setPagePerms] = useState<Record<string, string[]>>({});
  const dragKey = useRef<string | null>(null);
  const navigate = useNavigate();
  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  useEffect(() => {
    if (isPending) return;
    const load = async () => {
      const { count } = await supabase
        .from("status_incidents")
        .select("id", { count: "exact", head: true })
        .neq("status", "completed");
      setActiveIncidents(count ?? 0);
    };
    load();
    const ch = supabase
      .channel("rail-status-incidents")
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incidents" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isPending]);

  useEffect(() => {
    const loadOrder = async () => {
      const { data } = await supabase.from("nav_order").select("key,sort_order");
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { key: string; sort_order: number }) => {
        map[r.key] = r.sort_order;
      });
      setOrder(map);
    };
    loadOrder();
    const ch = supabase
      .channel("rail-nav-order")
      .on("postgres_changes", { event: "*", schema: "public", table: "nav_order" }, () => loadOrder())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  useEffect(() => {
    const loadPerms = async () => {
      const { data } = await supabase.from("page_permissions").select("page_key,allowed_roles");
      const map: Record<string, string[]> = {};
      (data ?? []).forEach((r: { page_key: string; allowed_roles: string[] }) => {
        map[r.page_key] = r.allowed_roles ?? [];
      });
      setPagePerms(map);
    };
    loadPerms();
    const ch = supabase
      .channel("rail-page-perms")
      .on("postgres_changes", { event: "*", schema: "public", table: "page_permissions" }, () => loadPerms())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  if (isPending) {
    return (
      <aside className="bg-rail w-[72px] shrink-0 flex flex-col items-center py-4 gap-2 border-r border-border">
        <RailIcon to="/gate" label="Gate" Icon={MessageSquare} active={path.startsWith("/gate")} accent />
        <div className="mt-auto" />
        <button onClick={handleSignOut} className="text-muted-foreground hover:text-destructive p-3" title="Sign out">
          <LogOut className="size-5" />
        </button>
      </aside>
    );
  }

  const items: RailItem[] = [
    { to: "/home", label: "Home", icon: Home, show: true },
    { to: "/profile", label: "My profile", icon: UserCircle2, show: true },
    { to: "/tickets", label: "Tickets", icon: Ticket, show: true },
    { to: "/shop", label: "Shop", icon: ShoppingBag, show: true },
    { to: "/install-guides", label: "Install guides", icon: BookOpen, show: true },
    { to: "/sports-guides", label: "Sports guides", icon: FileText, show: true },
    { to: "/reviews", label: "Customer reviews", icon: Star, show: true },
    { to: "/staff", label: "Staff directory", icon: Briefcase, show: true },
    { to: "/status", label: "System status", icon: Activity, show: true, badge: activeIncidents },
    { to: "/clock", label: "Clock", icon: Clock, show: isStaff },
    { to: "/shifts", label: "Shifts", icon: Calendar, show: isStaff },
    { to: "/moderation", label: "Moderation", icon: Shield, show: isMod },
    { to: "/admin", label: "Admin dashboard", icon: LayoutDashboard, show: isAdmin },
    { to: "/admin-dns", label: "QD DNS codes", icon: Globe, show: isAdmin },
    { to: "/admin-roles", label: "User roles", icon: ShieldCheck, show: isAdmin },
  ];

  const allowedByPerms = (to: string) => {
    if (isAdmin) return true;
    const key = to.replace(/^\//, "");
    const allowed = pagePerms[key];
    if (!allowed) return true; // unknown page: don't hide
    return roles.some((r: AppRole) => allowed.includes(r));
  };
  const visible = items.filter((i) => i.show && allowedByPerms(i.to));
  const sorted = [...visible].sort((a, b) => {
    const ai = order[a.to] ?? items.findIndex((x) => x.to === a.to) * 10 + 1000;
    const bi = order[b.to] ?? items.findIndex((x) => x.to === b.to) * 10 + 1000;
    return ai - bi;
  });

  const reorder = async (targetKey: string) => {
    const src = dragKey.current;
    dragKey.current = null;
    if (!src || src === targetKey) return;
    const keys = sorted.map((i) => i.to);
    const from = keys.indexOf(src);
    const to = keys.indexOf(targetKey);
    if (from < 0 || to < 0) return;
    keys.splice(to, 0, keys.splice(from, 1)[0]);
    const rows = keys.map((key, i) => ({ key, sort_order: (i + 1) * 10 }));
    setOrder(Object.fromEntries(rows.map((r) => [r.key, r.sort_order])));
    await supabase.from("nav_order").upsert(rows, { onConflict: "key" });
  };

  return (
    <aside className="bg-rail w-[72px] shrink-0 flex flex-col items-center py-4 gap-1 border-r border-border">
      <Link to="/home" className="h-12 w-[60px] rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-[9px] leading-tight text-primary-foreground shadow-glow mb-2 text-center break-words px-1">
        Support Community
      </Link>
      <div className="h-px w-8 bg-border my-1" />
      {sorted.map((i) => (
        <div
          key={i.to}
          draggable={isAdmin}
          onDragStart={() => { dragKey.current = i.to; }}
          onDragOver={(e) => { if (isAdmin) e.preventDefault(); }}
          onDrop={() => reorder(i.to)}
          className={isAdmin ? "cursor-grab active:cursor-grabbing" : undefined}
        >
          <RailIcon to={i.to} label={i.label} Icon={i.icon} active={path.startsWith(i.to)} badge={i.badge} />
        </div>
      ))}
      <div className="mt-auto" />
      <MentionsBadge />
      <NotificationBell />
      <button onClick={handleSignOut} className="text-muted-foreground hover:text-destructive p-3 rounded-xl hover:bg-surface-2 transition-colors" title="Sign out">
        <LogOut className="size-5" />
      </button>
    </aside>
  );
}

function RailIcon({
  to,
  label,
  Icon,
  active,
  accent,
  badge,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  accent?: boolean;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      title={label}
      className={cn(
        "group relative size-12 rounded-2xl flex items-center justify-center transition-all",
        active
          ? "bg-primary text-primary-foreground rounded-xl shadow-glow"
          : "bg-surface-2 text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:rounded-xl",
        accent && !active && "ring-1 ring-primary/40",
      )}
    >
      <Icon className="size-5" />
      {badge && badge > 0 ? (
        <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shadow-lg ring-2 ring-rail animate-pulse">
          {badge > 99 ? "99+" : badge}
        </span>
      ) : null}
      <span className="absolute left-full ml-3 px-2 py-1 rounded bg-popover text-popover-foreground text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-soft">
        {label}
      </span>
      {active && <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary-glow rounded-r" />}
    </Link>
  );
}

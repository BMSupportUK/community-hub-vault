import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Ticket, ShoppingBag, BookOpen, FileText, LogOut, MessageSquare, MessagesSquare, UserCircle2, Star, Trophy, Tv, Volleyball, Wrench, Goal, Users, Briefcase, MonitorPlay, ShieldCheck, Popcorn } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatarMenu } from "@/components/app/UserAvatarMenu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function SoccerPlayer({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="5" r="3" />
      <path d="M6 22l2-5 4-2 4 2 2 5" />
      <path d="M10 15l-2-3 4-2 4 2-2 3" />
      <circle cx="18" cy="8" r="2" />
      <path d="M16 9l-2-1" />
    </svg>
  );
}

function SoccerBall({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <polygon points="12,8 15.5,10.5 14,14.5 10,14.5 8.5,10.5" />
      <path d="M12 3v5" />
      <path d="M21 12l-5.5-1.5" />
      <path d="M18.5 19l-4.5-4.5" />
      <path d="M5.5 19l4.5-4.5" />
      <path d="M3 12l5.5-1.5" />
    </svg>
  );
}

interface RailItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  badge?: number;
}

export function IconRail({ inSheet = false }: { inSheet?: boolean } = {}) {
  const { user, isStaff, isPending, signOut, hasAny, roles, hasRole } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const isStaffOrMod = hasAny(["admin", "management", "staff", "moderator", "boro_fan_zone_moderator"]);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [unreadNewContent, setUnreadNewContent] = useState(0);
  const [order, setOrder] = useState<Record<string, number>>({});
  const [pagePerms, setPagePerms] = useState<Record<string, string[]>>({});
  const dragKey = useRef<string | null>(null);
  const channelInstanceId = useRef(Math.random().toString(36).slice(2)).current;
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
      .channel(`rail-status-incidents-${channelInstanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "status_incidents" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isPending, channelInstanceId]);

  useEffect(() => {
    if (isPending) return;
    const load = async () => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) { setUnreadNewContent(0); return; }
      const [{ data: posts }, { data: rs }, { data: prof }] = await Promise.all([
        supabase.from("new_content_posts").select("id, created_at, updated_at"),
        supabase.from("new_content_reads").select("post_id, read_at").eq("user_id", uid),
        supabase.from("profiles").select("new_content_baseline_at").eq("id", uid).maybeSingle(),
      ]);
      const reads: Record<string, string> = {};
      for (const r of (rs ?? []) as { post_id: string; read_at: string }[]) reads[r.post_id] = r.read_at;
      const baseline = (prof as { new_content_baseline_at: string | null } | null)?.new_content_baseline_at ?? null;
      const baseTs = baseline ? new Date(baseline).getTime() : 0;
      let count = 0;
      for (const p of (posts ?? []) as { id: string; created_at: string; updated_at: string | null }[]) {
        const upd = new Date(p.updated_at ?? p.created_at).getTime();
        if (baseline && upd <= baseTs) continue;
        const r = reads[p.id];
        if (!r || new Date(r).getTime() < upd) count++;
      }
      setUnreadNewContent(count);
    };
    load();
    const ch = supabase
      .channel(`rail-new-content-${channelInstanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "new_content_posts" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "new_content_reads" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [isPending, channelInstanceId]);

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
      .channel(`rail-nav-order-${channelInstanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "nav_order" }, () => loadOrder())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [channelInstanceId]);

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
      .channel(`rail-page-perms-${channelInstanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "page_permissions" }, () => loadPerms())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [channelInstanceId]);

  if (isPending) {
    return (
      <aside className={cn(
        "bg-rail w-[72px] flex-col items-center py-4 gap-2",
        inSheet
          ? "flex h-full"
          : "shrink-0 hidden lg:flex border-r border-border sticky top-0 self-start h-screen",
      )}>
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
    { to: "/forum", label: "Boro Fan Zone", icon: SoccerBall, show: true },
    { to: "/tickets", label: "Tickets", icon: Ticket, show: !hasRole("moderator") },
    { to: "/shop", label: "Shop", icon: ShoppingBag, show: true },
    { to: "/install-guides", label: "Install guides", icon: Wrench, show: true },
    { to: "/sports-guides", label: "Sports guides", icon: Goal, show: true },
    { to: "/knowledge-base", label: "Knowledge base", icon: BookOpen, show: true },
    { to: "/streaming-devices", label: "Streaming devices", icon: MonitorPlay, show: true },
    { to: "/vpn", label: "VPN guide", icon: ShieldCheck, show: true },
    { to: "/what-to-watch", label: "What to Watch", icon: Popcorn, show: true },
    { to: "/reviews", label: "Customer reviews", icon: Star, show: true },
    { to: "/leaderboard", label: "Leaderboard", icon: Trophy, show: true },
    { to: "/new-content", label: "New content", icon: Tv, show: true, badge: unreadNewContent },
    { to: "/members", label: "Members", icon: Users, show: true },
    { to: "/staff", label: "Staff", icon: Briefcase, show: true },
  ];

  const allowedByPerms = (to: string) => {
    if (to === "/forum") return true;
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
    <aside className={cn(
      "bg-rail w-[72px] flex-col items-center py-4 gap-1",
      inSheet
        ? "flex h-full"
        : "shrink-0 hidden lg:flex border-r border-border sticky top-0 self-start h-screen",
    )}>
      <Link to="/home" className="size-12 rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-[15px] text-primary-foreground shadow-glow mb-2">
        BM
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
          <RailIcon to={i.to} label={i.label} Icon={i.icon} active={path.startsWith(i.to)} badge={i.badge} draggable={isAdmin} />
        </div>
      ))}
      <div className="mt-auto" />
      <button
        onClick={handleSignOut}
        className="text-muted-foreground hover:text-destructive p-3 rounded-xl hover:bg-surface-2 transition-colors"
        title="Sign out"
      >
        <LogOut className="size-5" />
      </button>
      {user && (
        <div className="flex flex-col items-center pt-1">
          <UserAvatarMenu variant="bar" />
        </div>
      )}
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
  draggable,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  accent?: boolean;
  badge?: number;
  draggable?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={to}
            aria-label={label}
            draggable={false}
            onDragStart={draggable ? undefined : (e) => e.preventDefault()}
            className={cn(
              "group relative size-12 rounded-2xl flex items-center justify-center transition-all",
              active
                ? "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground rounded-xl shadow-glow ring-1 ring-primary-glow/60"
                : "bg-primary/15 text-primary-glow hover:bg-gradient-to-br hover:from-primary hover:to-primary-glow hover:text-primary-foreground hover:rounded-xl hover:shadow-glow",
              accent && !active && "ring-1 ring-primary/40",
            )}
          >
            <Icon className="size-5" />
            {badge && badge > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center shadow-lg ring-2 ring-rail animate-pulse">
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
            {active && <span className="absolute -left-1 top-1/2 -translate-y-1/2 h-8 w-1 bg-primary-glow rounded-r" />}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="z-[1000] whitespace-nowrap text-xs font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { Home, Ticket, ShoppingCart, BookOpen, FileText, LogIn, LogOut, MessageSquare, MessagesSquare, UserCircle2, Star, Trophy, Tv, Volleyball, Wrench, Goal, Users, Briefcase, MonitorPlay, Popcorn, Crown, UserPlus } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { useFinishedCompetitions } from "@/hooks/use-finished-competitions";
import { COMPETITIONS } from "@/lib/competitions";
import { cn } from "@/lib/utils";
import { isFanZonePath } from "@/lib/fan-zone-nav";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatarMenu } from "@/components/app/UserAvatarMenu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import mfcBadge from "@/assets/mfc-badge.png.asset.json";
import { useTalkChannelTotalCount } from "@/hooks/use-talk-channel-presence";
import fantasyBench from "@/assets/boro-fantasy-bench.png.asset.json";
import sportsGuideIcon from "@/assets/sports-guide-rail.png.asset.json";
import boroPredictionsGoal from "@/assets/boro-predictions-goal.png.asset.json";

/** Middlesbrough FC badge, used as the Boro Fan Zone rail icon. */
function BoroBadgeIcon({ className }: { className?: string }) {
  return (
    <img
      src={mfcBadge.url}
      alt=""
      aria-hidden
      draggable={false}
      className={cn(className, "size-8 rounded-full object-cover")}
    />
  );
}

/** Stadium bench / dugout image, used as the Boro Fantasy Manager rail icon. */
function FantasyBenchIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        className,
        "size-[30px] rounded-lg bg-white/15 ring-2 ring-primary-glow/70 flex items-center justify-center p-1 shadow-md"
      )}
    >
      <img
        src={fantasyBench.url}
        alt=""
        aria-hidden
        draggable={false}
        className="size-full object-contain contrast-[1.15] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
      />
    </div>
  );
}

/** Football pitch / sports guide icon, used as the Sports guides rail icon. */
function SportsGuideIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        className,
        "size-[30px] rounded-lg bg-white/15 ring-2 ring-primary-glow/70 flex items-center justify-center p-1 shadow-md"
      )}
    >
      <img
        src={sportsGuideIcon.url}
        alt=""
        aria-hidden
        draggable={false}
        className="size-full object-contain contrast-[1.15] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
      />
    </div>
  );
}

/** Goal net icon, used as the Boro Score Predictions rail icon. */
function PredictionsGoalIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        className,
        "size-[30px] rounded-lg bg-white/15 ring-2 ring-primary-glow/70 flex items-center justify-center p-1 shadow-md"
      )}
    >
      <img
        src={boroPredictionsGoal.url}
        alt=""
        aria-hidden
        draggable={false}
        className="size-full object-contain contrast-[1.15] drop-shadow-[0_2px_3px_rgba(0,0,0,0.5)]"
      />
    </div>
  );
}

type PagePermMap = Record<string, string[]>;
type NavOrderMap = Record<string, number>;

let cachedUnreadNewContent = 0;
let cachedNavOrder: NavOrderMap = {};
let cachedPagePerms: PagePermMap = {};

interface RailItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  badge?: number;
  badgeVariant?: "alert" | "online";
  search?: Record<string, string>;
  params?: Record<string, string>;
}

export function IconRail({ inSheet = false }: { inSheet?: boolean } = {}) {
  const { user, isStaff, isPending, signOut, hasAny, roles, hasRole, isFanZoneOnly } = useAuth();
  const isAdmin = hasAny(["admin", "management"]);
  const path = useRouterState({ select: (r) => r.location.pathname });
  const fanZoneInfo = useFanZoneMembership(user?.id ?? null);
  const canSeeFanZoneMembers =
    hasAny(["admin", "management", "boro_fan_zone_moderator", "boro_fan_zone_member"]) ||
    fanZoneInfo?.status === "approved";
  const [unreadNewContent, setUnreadNewContent] = useState(cachedUnreadNewContent);
  // LOCKED: side rail chat counter — total people in Talk Channels (staff included).
  // Do not change, restyle, or remove without explicit authorisation. See mem://constraints/chat-counters-locked
  const chatroomCount = useTalkChannelTotalCount();
  const [order, setOrder] = useState<NavOrderMap>(cachedNavOrder);
  const [pagePerms, setPagePerms] = useState<PagePermMap>(cachedPagePerms);
  const dragKey = useRef<string | null>(null);
  const navigate = useNavigate();
  const finishedCompetitions = useFinishedCompetitions();
  const handleSignOut = async () => {
    await signOut();
    // Hard redirect: guarantees every cached/protected view is torn down even
    // if a client-side navigation is swallowed mid-unmount.
    window.location.replace("/login");
  };

  useEffect(() => {
    if (isPending || inSheet || !user?.id) return;
    let cancelled = false;
    const load = async () => {
      const [{ data: posts }, { data: rs }, { data: prof }] = await Promise.all([
        supabase.from("new_content_posts").select("id, created_at, updated_at"),
        supabase.from("new_content_reads").select("post_id, read_at").eq("user_id", user.id),
        supabase.from("profiles").select("new_content_baseline_at").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
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
      cachedUnreadNewContent = count;
      setUnreadNewContent(count);
    };
    const id = window.setTimeout(() => void load(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [isPending, inSheet, user?.id]);

  useEffect(() => {
    if (inSheet) return;
    let cancelled = false;
    const loadOrder = async () => {
      const { data } = await supabase.from("nav_order").select("key,sort_order");
      if (cancelled) return;
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: { key: string; sort_order: number }) => {
        map[r.key] = r.sort_order;
      });
      cachedNavOrder = map;
      setOrder(map);
    };
    const id = window.setTimeout(() => void loadOrder(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [inSheet]);

  useEffect(() => {
    if (inSheet) return;
    let cancelled = false;
    const loadPerms = async () => {
      const { data } = await supabase.from("page_permissions").select("page_key,allowed_roles");
      if (cancelled) return;
      const map: Record<string, string[]> = {};
      (data ?? []).forEach((r: { page_key: string; allowed_roles: string[] }) => {
        map[r.page_key] = r.allowed_roles ?? [];
      });
      cachedPagePerms = map;
      setPagePerms(map);
    };
    const id = window.setTimeout(() => void loadPerms(), 250);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [inSheet]);

  if (isPending) {
    return (
      <aside className={cn(
        "relative w-[88px] flex-col items-center py-4 gap-3 overflow-hidden",
        "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_36%,var(--rail)),var(--rail)_42%,color-mix(in_oklab,var(--primary-glow)_22%,var(--surface-2)))]",
        "shadow-[inset_-1px_0_0_color-mix(in_oklab,var(--primary-glow)_55%,transparent),18px_0_46px_-28px_color-mix(in_oklab,var(--primary)_90%,transparent)]",
        "before:content-[''] before:absolute before:inset-y-4 before:left-2 before:w-1 before:rounded-full before:bg-gradient-primary before:shadow-glow before:pointer-events-none",
        inSheet
          ? "flex h-full"
          : "shrink-0 hidden md:flex border-r border-primary-glow/40 sticky top-0 h-dvh",
      )}>
        <RailIcon to="/gate" label="Gate" Icon={MessageSquare} active={path.startsWith("/gate")} accent />
        <div className="mt-auto" />
        <button onClick={handleSignOut} className="relative z-10 text-muted-foreground hover:text-destructive p-3 rounded-2xl hover:bg-surface-2 transition-colors" title="Sign out">
          <LogOut className="size-5" />
        </button>
      </aside>
    );
  }

  // Fan-Zone-only accounts never see the BM Support rail, wherever they are.
  const inFanZone = isFanZonePath(path) || isFanZoneOnly;


  const supportItems: RailItem[] = [
    { to: "/home", label: "Home", icon: Home, show: true },
    { to: "/home/$channel", label: "Customer Chatroom", icon: MessageSquare, show: true, params: { channel: "welcome" }, badge: chatroomCount, badgeVariant: "online" },
    { to: "/tickets", label: "Tickets", icon: Ticket, show: !hasRole("moderator") },
    { to: "/shop", label: "Shop", icon: ShoppingCart, show: true },
    { to: "/install-guides", label: "Install Guides & BM App Store", icon: Wrench, show: true },
    { to: "/sports-guides", label: "Sports guides", icon: SportsGuideIcon, show: true },
    { to: "/knowledge-base", label: "Knowledge base", icon: BookOpen, show: true },
    { to: "/what-to-watch", label: "What to Watch", icon: Popcorn, show: true },
    { to: "/leaderboard", label: "Referrals", icon: Trophy, show: true },
    { to: "/new-content", label: "New content", icon: Tv, show: true, badge: unreadNewContent },
    { to: "/members", label: "Members", icon: Users, show: true },
    { to: "/staff", label: "Staff", icon: Briefcase, show: true },
    { to: "/forum", label: "Boro Fan Zone", icon: BoroBadgeIcon, show: true },
  ];

  const fanZoneItems: RailItem[] = [
    // Dual-role accounts (BM Support + Fan Zone) keep a way back to BM Support.
    { to: "/home", label: "BM Support", icon: Home, show: !!user && !isFanZoneOnly },
    { to: user ? "/forum" : "/fan-zone", label: "Boro Fan Zone", icon: BoroBadgeIcon, show: true },
    { to: "/fanzone/messages", label: "Inbox", icon: MessagesSquare, show: !!user },
    { to: "/admin-fan-zone", label: "Members", icon: Users, show: !!user && canSeeFanZoneMembers },
    { to: "/fanzone/profile", label: "Fan Zone Profile", icon: UserCircle2, show: !!user },
    { to: "/boro-fantasy", label: "Boro Fantasy", icon: FantasyBenchIcon, show: true },
    ...COMPETITIONS.map((c) => ({
      to: c.to,
      label: c.railLabel,
      icon: c.key === "boro2026" ? PredictionsGoalIcon : Goal,
      show: !finishedCompetitions.includes(c.key),
    })),
    { to: "/competition-winners", label: "Competition Winners", icon: Crown, show: true },
    { to: "/login", label: "Sign in", icon: LogIn, show: !user },
    { to: "/signup", label: "Join Fan Zone", icon: UserPlus, show: !user, search: { intent: "fan-zone" } },
  ];


  const items = inFanZone ? fanZoneItems : supportItems;
  // Each rail keeps its own saved order, namespaced so BM Support and the
  // Boro Fan Zone never overwrite each other's positions.
  const scope = inFanZone ? "fanzone" : "support";
  const orderKey = (to: string) => `${scope}:${to}`;

  const allowedByPerms = (to: string) => {
    if (to === "/forum" || to === "/fan-zone") return true;
    // Fan Zone members list: gated by canSeeFanZoneMembers, not page permissions.
    if (to === "/admin-fan-zone" && inFanZone) return true;
    if (hasAny(["admin"])) return true;
    const key = to.replace(/^\//, "").split("/")[0];
    const allowed = pagePerms[key];
    // Unregistered page: nothing to enforce. Registered with nothing ticked:
    // owner only (handled by the admin bypass above).
    if (!allowed) return true;
    return roles.some((r: AppRole) => allowed.includes(r));
  };
  const visible = items.filter((i) => i.show && allowedByPerms(i.to));

  const sorted = [...visible].sort((a, b) => {
    const ai = order[orderKey(a.to)] ?? items.findIndex((x) => x.to === a.to) * 10 + 1000;
    const bi = order[orderKey(b.to)] ?? items.findIndex((x) => x.to === b.to) * 10 + 1000;
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
    const rows = keys.map((key, i) => ({ key: orderKey(key), sort_order: (i + 1) * 10 }));
    // Merge so the other rail's saved order stays intact.
    const nextOrder = { ...order, ...Object.fromEntries(rows.map((r) => [r.key, r.sort_order])) };
    cachedNavOrder = nextOrder;
    setOrder(nextOrder);
    await supabase.from("nav_order").upsert(rows, { onConflict: "key" });
  };

  return (
    <aside className={cn(
      "relative w-[88px] flex-col items-center py-4 gap-2 overflow-hidden",
      "bg-[linear-gradient(180deg,color-mix(in_oklab,var(--primary)_36%,var(--rail)),var(--rail)_42%,color-mix(in_oklab,var(--primary-glow)_22%,var(--surface-2)))]",
      "shadow-[inset_-1px_0_0_color-mix(in_oklab,var(--primary-glow)_55%,transparent),18px_0_46px_-28px_color-mix(in_oklab,var(--primary)_90%,transparent)]",
      "before:content-[''] before:absolute before:inset-y-4 before:left-2 before:w-1 before:rounded-full before:bg-gradient-primary before:shadow-glow before:pointer-events-none",
      "after:content-[''] after:absolute after:inset-x-3 after:top-3 after:h-24 after:rounded-full after:bg-primary-glow/20 after:blur-2xl after:pointer-events-none",
      inSheet
        ? "flex h-full"
        : "shrink-0 hidden md:flex border-r border-primary-glow/40 sticky top-0 h-dvh",
    )}>
      <Link
        to={!user ? "/fan-zone" : isFanZoneOnly ? "/forum" : "/home"}
        aria-label={!user || isFanZoneOnly ? "Boro Fan Zone" : inFanZone ? "Back to BM Support" : "BM Support"}
        title={!user || isFanZoneOnly ? "Boro Fan Zone" : inFanZone ? "Back to BM Support" : "BM Support"}
        className="relative z-10 shrink-0 size-12 rounded-2xl bg-gradient-primary flex items-center justify-center font-display font-bold text-sm text-primary-foreground shadow-glow mb-1 ring-2 ring-primary-glow/70 hover:ring-primary-glow hover:scale-110 transition-all duration-200"
      >
        {!user || isFanZoneOnly ? "FZ" : "BM"}
      </Link>

      <div className="relative z-10 shrink-0 h-px w-12 bg-gradient-to-r from-transparent via-primary-glow to-transparent" />
      <div className="relative z-10 flex-1 min-h-0 w-full overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {sorted.map((i) => {
        const active =
          i.to === "/home"
            ? path === "/home"
            : i.to === "/home/$channel"
              ? path.startsWith("/home/")
              : path.startsWith(i.to);
        return (
          <div
            key={i.to}
            draggable={isAdmin}
            onDragStart={() => { dragKey.current = i.to; }}
            onDragOver={(e) => { if (isAdmin) e.preventDefault(); }}
            onDrop={() => reorder(i.to)}
            className={cn("relative z-10 shrink-0", isAdmin ? "cursor-grab active:cursor-grabbing" : undefined)}
          >
            <RailIcon to={i.to} label={i.label} Icon={i.icon} active={active} badge={i.badge} badgeVariant={i.badgeVariant} draggable={isAdmin} search={i.search} params={i.params} />
          </div>
        );
      })}
      </div>
      <div className="relative z-10 shrink-0 h-px w-12 bg-gradient-to-r from-transparent via-primary-glow to-transparent" />
      {user && (
        <div className="flex flex-col items-center pt-1 shrink-0">
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
  badgeVariant = "alert",
  draggable,
  search,
  params,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  accent?: boolean;
  badge?: number;
  badgeVariant?: "alert" | "online";
  draggable?: boolean;
  search?: Record<string, string>;
  params?: Record<string, string>;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to={to}
            params={params as never}
            search={search as never}
            aria-label={label}
             title={label}
            draggable={false}
            onDragStart={draggable ? undefined : (e) => e.preventDefault()}
            className={cn(
              "group relative z-10 size-[52px] rounded-2xl flex items-center justify-center transition-all duration-200",
              active
                ? "bg-gradient-primary text-primary-foreground rounded-xl shadow-glow ring-2 ring-primary-glow scale-110"
                : "bg-[color-mix(in_oklab,var(--surface)_62%,transparent)] text-primary-glow ring-1 ring-primary-glow/35 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_12%,transparent)] hover:bg-gradient-primary hover:text-primary-foreground hover:rounded-xl hover:shadow-glow hover:scale-110 hover:ring-primary-glow",
              accent && !active && "ring-2 ring-primary/55",
            )}
          >
            <Icon className="size-[22px]" />
            {badge && badge > 0 ? (
              <span className={cn(
                "absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full text-white text-[11px] font-bold flex items-center justify-center shadow-lg ring-2 ring-rail",
                badgeVariant === "online" ? "bg-emerald-500" : "bg-red-500 animate-pulse",
              )}>
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
            {active && <span className="absolute -left-3 top-1/2 -translate-y-1/2 h-10 w-2 bg-primary-glow rounded-r shadow-glow" />}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8} className="z-[1000] whitespace-nowrap text-xs font-medium">
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

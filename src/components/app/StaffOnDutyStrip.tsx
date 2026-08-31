import { useEffect, useMemo, useState } from "react";
import { CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useRoleFlashMap, roleFlashClass, resolveAvatarUrl, type FlashRole } from "@/lib/role-flash";
import { formatRoleLabel } from "@/lib/role-label";
import { DndCountdown } from "@/components/app/DndCountdown";
import { useDndStatus } from "@/hooks/use-dnd";
import { Nameplate } from "@/components/app/Nameplate";
import { ChatMiniProfile, type ChatMiniProfileData } from "@/components/app/ChatMiniProfile";
import { type BreakKind, BREAK_LIMITS as STAFF_BREAK_LIMITS, breakLabel, breakIcon } from "@/lib/breaks";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTalkChannelPresentUsers } from "@/hooks/use-talk-channel-presence";

type StaffShift = { id: string; user_id: string; clock_in: string };
type StaffBreak = { id: string; shift_id: string; user_id: string; kind: BreakKind; started_at: string };
type StaffProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; equipped_nameplate_id: string | null; last_seen_at?: string | null };

/** Presence dot that turns purple in realtime while the user has DND active. */
function PresenceDot({ userId, baseClass, dndClass }: { userId: string; baseClass: string; dndClass?: string }) {
  const dnd = useDndStatus(userId);
  return (
    <span
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white",
        dnd?.active ? (dndClass ?? "bg-purple-500 shadow-[0_0_6px_2px_rgba(168,85,247,0.7)]") : baseClass,
      )}
    />
  );
}

/** Dane J is always presented as online unless DND is active. */
function isDaneJProfile(profile?: { display_name?: string | null; username?: string | null } | null) {
  if (!profile) return false;
  const displayName = profile.display_name?.trim() ?? "";
  const username = profile.username?.trim() ?? "";
  return /^dane\s+j(?:\b|$)/i.test(displayName) || /^dane[._ -]?j(?:\b|$)/i.test(username);
}

/** Status line for Dane J's card: Online. Hidden when DND is set (the DND badge below says it). */
function DaneStatusLine({ userId }: { userId: string }) {
  const dnd = useDndStatus(userId);
  if (dnd?.active) return null;
  return (
    <div className="text-[10px] font-semibold text-emerald-500">Online</div>
  );
}


const ROLE_ORDER = ["admin", "management", "staff", "moderator"] as const;
const OFF_ORDER = ["admin", "management", "staff", "moderator"] as const;

export function StaffOnDutySidebar() {
  return <StaffOnDutyStrip variant="sidebar" />;
}

export function StaffOnDutyStrip({
  variant = "strip",
  hideRoles = [],
}: {
  variant?: "strip" | "sidebar" | "tickets";
  hideRoles?: string[];
} = {}) {
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [breaks, setBreaks] = useState<StaffBreak[]>([]);
  const [profiles, setProfiles] = useState<Record<string, StaffProfile>>({});
  const [offDuty, setOffDuty] = useState<Array<StaffProfile & { role: string }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const [selfId, setSelfId] = useState<string | null>(null);
  const [dutyTab, setDutyTab] = useState<"on" | "off">("on");
  const roleFlashMap = useRoleFlashMap();
  const presentUserIds = useTalkChannelPresentUsers();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setSelfId(data.user?.id ?? null));
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => {
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from("shifts").select("id,user_id,clock_in").is("clock_out", null),
      supabase.from("breaks").select("id,shift_id,user_id,kind,started_at").is("ended_at", null),
    ]);
    const ss = (s as StaffShift[]) ?? [];
    setShifts(ss);
    setBreaks((b as StaffBreak[]) ?? []);
    const workingIds = new Set(ss.map((x) => x.user_id));
    // All staff-role users for the off-duty section
    const { data: roleRows } = await supabase
      .from("user_roles").select("user_id,role")
      .in("role", ["admin", "management", "moderator", "staff"]);
    const bestRole = new Map<string, string>();
    const rank = (r: string) => ROLE_ORDER.indexOf(r as (typeof ROLE_ORDER)[number]);
    for (const r of (roleRows as Array<{ user_id: string; role: string }>) ?? []) {
      const cur = bestRole.get(r.user_id);
      if (!cur || rank(r.role) < rank(cur)) bestRole.set(r.user_id, r.role);
    }
    const allIds = Array.from(bestRole.keys());
    const ids = Array.from(new Set([...allIds, ...workingIds]));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id,username,display_name,avatar_url,equipped_nameplate_id,last_seen_at").in("id", ids);
      const map = Object.fromEntries(((profs as StaffProfile[]) ?? []).map((p) => [p.id, p]));
      setProfiles(map);
      const isDaneJ = (profile: StaffProfile) => {
        const displayName = profile.display_name?.trim() ?? "";
        const username = profile.username?.trim() ?? "";
        return /^dane\s+j(?:\b|$)/i.test(displayName) || /^dane[._ -]?j(?:\b|$)/i.test(username);
      };
      const off = allIds
        .filter((id) => !workingIds.has(id))
        .map((id) => ({ ...map[id], id, role: bestRole.get(id) ?? "moderator" }))
        .filter((p) => p.id)
        .sort((a, b) => {
          const d = OFF_ORDER.indexOf(a.role as (typeof OFF_ORDER)[number]) - OFF_ORDER.indexOf(b.role as (typeof OFF_ORDER)[number]);
          if (d !== 0) return d;
          if (a.role === "admin") {
            if (isDaneJ(a) && !isDaneJ(b)) return -1;
            if (!isDaneJ(a) && isDaneJ(b)) return 1;
          }
          const an = a.display_name || a.username || "";
          const bn = b.display_name || b.username || "";
          return an.localeCompare(bn);
        });
      setOffDuty(off);
    } else {
      setProfiles({});
      setOffDuty([]);
    }
  };

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("shared-staff-onduty-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "breaks" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => refresh())
      .subscribe();
    // Safety net: realtime can drop events (socket blips, backgrounded tabs), so
    // poll periodically and whenever the tab regains focus/visibility. Keeps the
    // shift/break timers correct without the user hitting refresh.
    const poll = setInterval(() => { void refresh(); }, 20_000);
    const onWake = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onWake);
    document.addEventListener("visibilitychange", onWake);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
      window.removeEventListener("focus", onWake);
      document.removeEventListener("visibilitychange", onWake);
    };
  }, []);

  const breakByUser = useMemo(() => {
    const m = new Map<string, StaffBreak>();
    for (const br of breaks) m.set(br.user_id, br);
    return m;
  }, [breaks]);

  const fmtMinSec = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${m}:${ss}`;
  };
  const fmtHMS = (sec: number) => {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600).toString().padStart(2, "0");
    const m = Math.floor((s % 3600) / 60).toString().padStart(2, "0");
    return `${h}h ${m}m`;
  };

  const isSidebar = variant === "sidebar";
  const isTickets = variant === "tickets";
  /** On the tickets strip, Dane J's presence follows business hours like everyone else. */
  const daneOverride = !isTickets;
  const roleRank = (id: string) => {
    const r = roleFlashMap.get(id);
    const i = ROLE_ORDER.indexOf((r ?? "") as (typeof ROLE_ORDER)[number]);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  const allOrderedShifts = [...shifts]
    .sort((a, b) => {
      const d = roleRank(a.user_id) - roleRank(b.user_id);
      if (d !== 0) return d;
      const an = profiles[a.user_id]?.display_name || profiles[a.user_id]?.username || "";
      const bn = profiles[b.user_id]?.display_name || profiles[b.user_id]?.username || "";
      return an.localeCompare(bn);
    })
    .filter((s) => !hideRoles.includes(roleFlashMap.get(s.user_id) ?? ""));

  const daneShift = allOrderedShifts.find((s) => isDaneJProfile(profiles[s.user_id]));
  const orderedShifts = allOrderedShifts.filter((s) => !isDaneJProfile(profiles[s.user_id]));

  const allVisibleOffDuty = useMemo(
    () => offDuty.filter((p) => !hideRoles.includes(p.role)),
    [offDuty, hideRoles]
  );
  const daneOff = daneShift ? undefined : allVisibleOffDuty.find((p) => isDaneJProfile(p));
  const visibleOffDuty = useMemo(
    () => allVisibleOffDuty.filter((p) => !isDaneJProfile(p)),
    [allVisibleOffDuty]
  );


  const miniProfile = (userId: string, isWorking: boolean): ChatMiniProfileData | null => {
    const p = profiles[userId];
    if (!p) return null;
    const name = p.display_name || p.username || "Staff";
    const lastSeen = p.last_seen_at ?? null;
    const recentlyActive = lastSeen ? now - new Date(lastSeen).getTime() < 10 * 60 * 1000 : false;
    return {
      userId,
      name,
      username: p.username,
      avatarUrl: resolveAvatarUrl(userId, p.avatar_url, roleFlashMap),
      hasAvatar: Boolean(p.avatar_url),
      nameplateId: p.equipped_nameplate_id,
      role: (roleFlashMap.get(userId) ?? null) as FlashRole | null,
      isOnline: isWorking || recentlyActive,
      lastSeenAt: lastSeen,
      isSelf: userId === selfId,
    };
  };

  const renderOnDutyCard = (s: StaffShift) => {
    const p = profiles[s.user_id];
    const name = p?.display_name || p?.username || "Staff";
    const br = breakByUser.get(s.user_id);
    const shiftElapsed = (now - new Date(s.clock_in).getTime()) / 1000;
    const onBreak = !!br;
    const brElapsed = br ? (now - new Date(br.started_at).getTime()) / 1000 : 0;
    const brRemain = br ? STAFF_BREAK_LIMITS[br.kind] - brElapsed : 0;
    const over = brRemain < 0;
    const mp = miniProfile(s.user_id, true);
    const card = (
      <div
        className={cn(
          "rounded-lg p-2.5 border backdrop-blur transition-colors min-w-0",
          isTickets ? "w-full sm:w-[220px]" : "w-full",
          onBreak
            ? (over ? "bg-red-500/30 border-red-300/60" : "bg-amber-300/30 border-amber-200/60")
            : "bg-emerald-400/25 border-emerald-200/50",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <img src={resolveAvatarUrl(s.user_id, p?.avatar_url, roleFlashMap)} alt={name} className="size-8 rounded-full object-cover ring-2 ring-white/40" />
            <PresenceDot
              userId={s.user_id}
              baseClass={onBreak ? (over ? "bg-red-500" : "bg-amber-400") : "bg-emerald-500"}
              {...(daneOverride && isDaneJProfile(p) ? { dndClass: "bg-gray-400" } : {})}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Nameplate
              id={p?.equipped_nameplate_id}
              className={cn(
                "flex flex-col justify-center w-full rounded-md px-2 py-1 shadow-sm isolate",
                isTickets ? "pr-2" : "pr-12",
              )}
            >
              <span className={cn("text-xs font-semibold text-white truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]", roleFlashClass(roleFlashMap.get(s.user_id)))}>{name}</span>
              {roleFlashMap.get(s.user_id) && (
                <span className="text-[9px] font-medium uppercase tracking-wider text-white/90 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                  {formatRoleLabel(roleFlashMap.get(s.user_id))}
                </span>
              )}
            </Nameplate>
            <div className="mt-1 text-[10px] text-muted-foreground">
              {onBreak ? (
                <span className="flex items-center gap-1">
                  {(() => { const Icon = breakIcon(br!.kind); return <Icon className="size-3 shrink-0" />; })()}
                  <span className="truncate">{breakLabel(br!.kind)} {over ? `+${fmtMinSec(-brRemain)}` : fmtMinSec(brRemain)}</span>
                </span>
              ) : daneOverride && isDaneJProfile(p) ? (
                <DaneStatusLine userId={s.user_id} />
              ) : (
                <span>{fmtHMS(shiftElapsed)}</span>
              )}
            </div>
            <DndCountdown userId={s.user_id} compact className="mt-1" />

          </div>
        </div>
      </div>
    );
    return mp ? (
      <ChatMiniProfile key={s.id} profile={mp} className="block w-full">
        {card}
      </ChatMiniProfile>
    ) : (
      <div key={s.id}>{card}</div>
    );
  };

  const renderOffDutyCard = (p: StaffProfile & { role: string }) => {
    const name = p.display_name || p.username || "Staff";
    const dane = daneOverride && isDaneJProfile(p);
    const inChat = presentUserIds.has(p.id);
    const mp = miniProfile(p.id, dane || inChat);
    const card = (
      <div
        className={cn(
          "rounded-lg p-2.5 border backdrop-blur min-w-0",
          dane
            ? "bg-emerald-400/25 border-emerald-200/50"
            : inChat
              ? "bg-emerald-400/10 border-emerald-200/30"
              : "border-white/15 bg-white/5",
          isTickets ? "w-full sm:w-[220px]" : "w-full",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative shrink-0">
            <img
              src={resolveAvatarUrl(p.id, p.avatar_url, roleFlashMap)}
              alt={name}
              className={cn(
                "size-8 rounded-full object-cover",
                dane || inChat ? "ring-2 ring-white/40" : "ring-2 ring-white/20 opacity-70 grayscale",
              )}
            />
            <PresenceDot
              userId={p.id}
              baseClass={dane || inChat ? "bg-emerald-500" : "bg-gray-400"}
              {...(dane ? { dndClass: "bg-gray-400" } : {})}
            />
          </div>
          <div className="min-w-0 flex-1">
            <Nameplate
              id={p.equipped_nameplate_id}
              className={cn(
                "flex flex-col justify-center w-full rounded-md px-2 py-1 shadow-sm isolate",
                dane || inChat ? "" : "opacity-80",
                isTickets ? "pr-2" : "pr-12",
              )}
            >
              <span className={cn("text-xs font-semibold text-white/90 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]", roleFlashClass(roleFlashMap.get(p.id)))}>{name}</span>
              {roleFlashMap.get(p.id) && (
                <span className="text-[9px] font-medium uppercase tracking-wider text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                  {formatRoleLabel(roleFlashMap.get(p.id))}
                </span>
              )}
            </Nameplate>
            <div className="mt-1">
              {dane ? (
                <DaneStatusLine userId={p.id} />
              ) : inChat ? (
                <div className="text-[10px] font-semibold text-emerald-500">Off duty but chatting</div>
              ) : (
                <div className="text-[10px] text-muted-foreground">Off duty</div>
              )}
            </div>

            <DndCountdown userId={p.id} compact className="mt-1" />
          </div>
        </div>
      </div>
    );
    return mp ? (
      <ChatMiniProfile key={p.id} profile={mp} className="block w-full">
        {card}
      </ChatMiniProfile>
    ) : (
      <div key={p.id}>{card}</div>
    );
  };

  const daneSection = (daneShift || daneOff) ? (
    <div className="relative mb-3 pb-3 border-b border-white/15">
      <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200 mb-1.5">
        Owner
      </div>
      <div className={cn(isSidebar ? "flex flex-col gap-2" : "flex flex-wrap gap-2 min-w-0")}>
        {daneShift ? renderOnDutyCard(daneShift) : renderOffDutyCard(daneOff!)}
      </div>
    </div>
  ) : null;

  if (isTickets) {
    return (
      <div className="px-4 pt-4">
        <div className="rounded-xl border border-white/15 p-3 shadow-lg relative overflow-hidden bg-gradient-to-r from-violet-600/40 via-fuchsia-600/40 to-blue-600/40 backdrop-blur">
          {daneSection}
          <Tabs value={dutyTab} onValueChange={(v) => setDutyTab(v as "on" | "off")}>

            <TabsList className="w-full bg-white/10 border border-white/20 p-1 mb-2 flex-wrap h-auto gap-1">
              <TabsTrigger
                value="on"
                className="flex-1 min-w-0 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/80 data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500/80 data-[state=active]:to-teal-500/80 data-[state=active]:text-white data-[state=active]:shadow px-1.5 sm:px-3"
              >
                <span className="truncate">Staff on duty · {orderedShifts.length}</span>
              </TabsTrigger>
              <TabsTrigger
                value="off"
                className="flex-1 min-w-0 text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-white/80 data-[state=active]:bg-gradient-to-r data-[state=active]:from-white/25 data-[state=active]:to-white/15 data-[state=active]:text-white data-[state=active]:shadow px-1.5 sm:px-3"
              >
                <span className="truncate">Off duty · {visibleOffDuty.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="on" className="mt-0 min-w-0">
              {orderedShifts.length === 0 ? (
                <div className="rounded-lg p-2.5 border border-white/20 bg-white/10 text-white/80 text-xs flex items-center gap-2 w-full">
                  <CircleDot className="size-3.5 opacity-60 shrink-0" />
                  <span>No staff currently on duty</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 min-w-0">
                  {orderedShifts.map((s) => renderOnDutyCard(s))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="off" className="mt-0 min-w-0">
              {visibleOffDuty.length === 0 ? (
                <div className="rounded-lg p-2.5 border border-white/20 bg-white/10 text-white/80 text-xs flex items-center gap-2 w-full">
                  <CircleDot className="size-3.5 opacity-60 shrink-0" />
                  <span>All staff are on duty</span>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 min-w-0">
                  {visibleOffDuty.map((p) => renderOffDutyCard(p))}
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex items-center justify-end gap-1 text-[10px] text-white/80 mt-2">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> live
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isSidebar ? "p-3 h-full overflow-y-auto" : "px-4 pt-4"}>
      <div className={cn(
        "rounded-xl border border-white/15 p-3 shadow-lg relative overflow-hidden bg-gradient-to-r from-violet-600/40 via-fuchsia-600/40 to-blue-600/40 backdrop-blur",
      )}>
        {daneSection}
        <div className="flex items-center justify-between mb-2 relative">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/90">
            Staff on duty · {orderedShifts.length}

          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/80">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> live
          </div>
        </div>
        <div className={cn(
          "relative",
          isSidebar ? "flex flex-col gap-2" : "grid gap-2 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]",
        )}>
          {orderedShifts.length === 0 && (
            <div className={cn(
              "rounded-lg p-2.5 border border-white/20 bg-white/10 text-white/80 text-xs flex items-center gap-2",
              "w-full",
            )}>
              <CircleDot className="size-3.5 opacity-60" />
              <span>No staff currently on duty</span>
            </div>
          )}
          {orderedShifts.map((s) => renderOnDutyCard(s))}
        </div>
        {(() => {
          if (visibleOffDuty.length === 0) return null;
          const groups: Record<string, typeof visibleOffDuty> = {};
          for (const p of visibleOffDuty) {
            (groups[p.role] ??= []).push(p);
          }
          return (
            <div className="relative mt-3 pt-3 border-t border-white/15">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-2">
                Off duty · {visibleOffDuty.length}
              </div>
              <div className={cn(isSidebar ? "flex flex-col gap-4" : "flex flex-col gap-4")}>
                {OFF_ORDER.filter((r) => groups[r]?.length).map((role) => {
                  const members = groups[role];
                  return (
                    <div key={role} className="min-w-0">
                      <div className={cn("text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5", roleFlashClass(roleFlashMap.get(members[0].id)))}>
                        <span>{formatRoleLabel(role)}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">{members.length}</span>
                      </div>
                      <div className={cn(isSidebar ? "flex flex-col gap-2" : "grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
                        {members.map((p) => renderOffDutyCard(p))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

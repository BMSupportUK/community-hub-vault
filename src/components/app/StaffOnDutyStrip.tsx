import { useEffect, useMemo, useState } from "react";
import { CircleDot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useRoleFlashMap, roleFlashClass, resolveAvatarUrl, type FlashRole } from "@/lib/role-flash";
import { formatRoleLabel } from "@/lib/role-label";
import { DndCountdown } from "@/components/app/DndCountdown";
import { Nameplate } from "@/components/app/Nameplate";
import { ChatMiniProfile, type ChatMiniProfileData } from "@/components/app/ChatMiniProfile";
import { type BreakKind, BREAK_LIMITS as STAFF_BREAK_LIMITS, breakLabel, breakIcon } from "@/lib/breaks";

type StaffShift = { id: string; user_id: string; clock_in: string };
type StaffBreak = { id: string; shift_id: string; user_id: string; kind: BreakKind; started_at: string };
type StaffProfile = { id: string; username: string | null; display_name: string | null; avatar_url: string | null; equipped_nameplate_id: string | null; last_seen_at?: string | null };

const ROLE_ORDER = ["admin", "management", "staff", "moderator"] as const;
const OFF_ORDER = ["admin", "management", "staff", "moderator"] as const;

export function StaffOnDutySidebar() {
  return <StaffOnDutyStrip variant="sidebar" />;
}

export function StaffOnDutyStrip({ variant = "strip" }: { variant?: "strip" | "sidebar" } = {}) {
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [breaks, setBreaks] = useState<StaffBreak[]>([]);
  const [profiles, setProfiles] = useState<Record<string, StaffProfile>>({});
  const [offDuty, setOffDuty] = useState<Array<StaffProfile & { role: string }>>([]);
  const [now, setNow] = useState(() => Date.now());
  const [selfId, setSelfId] = useState<string | null>(null);
  const roleFlashMap = useRoleFlashMap();

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
    return () => { supabase.removeChannel(ch); };
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
  const roleRank = (id: string) => {
    const r = roleFlashMap.get(id);
    const i = ROLE_ORDER.indexOf((r ?? "") as (typeof ROLE_ORDER)[number]);
    return i === -1 ? ROLE_ORDER.length : i;
  };
  const orderedShifts = [...shifts].sort((a, b) => {
    const d = roleRank(a.user_id) - roleRank(b.user_id);
    if (d !== 0) return d;
    const an = profiles[a.user_id]?.display_name || profiles[a.user_id]?.username || "";
    const bn = profiles[b.user_id]?.display_name || profiles[b.user_id]?.username || "";
    return an.localeCompare(bn);
  });

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

  return (
    <div className={isSidebar ? "p-3 h-full overflow-y-auto" : "px-4 pt-4"}>
      <div className="rounded-xl border border-white/15 p-3 shadow-lg relative overflow-hidden bg-gradient-to-r from-violet-600/40 via-fuchsia-600/40 to-blue-600/40 backdrop-blur">
        <div className="flex items-center justify-between mb-2 relative">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-white/90">
            Staff on duty · {shifts.length}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-white/80">
            <span className="size-2 rounded-full bg-emerald-400 animate-pulse" /> live
          </div>
        </div>
        <div className={cn("relative", isSidebar ? "flex flex-col gap-2" : "flex gap-2 overflow-x-auto pb-1")}>
          {shifts.length === 0 && (
            <div className={cn(
              "rounded-lg p-2.5 border border-white/20 bg-white/10 text-white/80 text-xs flex items-center gap-2",
              isSidebar ? "w-full" : "shrink-0 min-w-[180px]",
            )}>
              <CircleDot className="size-3.5 opacity-60" />
              <span>No staff currently on duty</span>
            </div>
          )}
          {orderedShifts.map((s) => {
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
                  "rounded-lg p-2.5 border backdrop-blur transition-colors",
                  isSidebar ? "w-full" : "shrink-0 min-w-[180px]",
                  onBreak
                    ? (over ? "bg-red-500/30 border-red-300/60" : "bg-amber-300/30 border-amber-200/60")
                    : "bg-emerald-400/25 border-emerald-200/50",
                )}
              >
...
                  </div>
                </div>
              </div>
            );
            return mp ? (
              <ChatMiniProfile key={s.id} profile={mp} className={cn("block", isSidebar ? "w-full" : "shrink-0")}>
                {card}
              </ChatMiniProfile>
            ) : (
              <div key={s.id}>{card}</div>
            );
          })}
        </div>
        {offDuty.length > 0 && (
          <div className="relative mt-3 pt-3 border-t border-white/15">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70 mb-2">
              Off duty · {offDuty.length}
            </div>
            <div className={cn("flex", isSidebar ? "flex-col gap-4" : "flex-col gap-4")}>
              {(() => {
                const groups: Record<string, typeof offDuty> = {};
                for (const p of offDuty) {
                  (groups[p.role] ??= []).push(p);
                }
                return OFF_ORDER.filter((r) => groups[r]?.length).map((role) => {
                  const members = groups[role];
                  return (
                    <div key={role}>
                      <div className={cn("text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5", roleFlashClass(roleFlashMap.get(members[0].id)))}>
                        <span>{formatRoleLabel(role)}</span>
                        <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-white/80">{members.length}</span>
                      </div>
                      <div className={cn(isSidebar ? "flex flex-col gap-2" : "flex gap-2 overflow-x-auto pb-1")}>
                        {members.map((p) => {
                          const name = p.display_name || p.username || "Staff";
                          return (
                            <div
                              key={p.id}
                              className={cn(
                                "rounded-lg p-2.5 border border-white/15 bg-white/5 backdrop-blur",
                                isSidebar ? "w-full" : "shrink-0 min-w-[180px]",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <img
                                    src={resolveAvatarUrl(p.id, p.avatar_url, roleFlashMap)}
                                    alt={name}
                                    className="size-8 rounded-full object-cover ring-2 ring-white/20 opacity-70 grayscale"
                                  />
                                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white bg-gray-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <Nameplate
                                    id={p.equipped_nameplate_id}
                                    className="flex flex-col justify-center w-full rounded-md px-2 py-1 pr-12 shadow-sm isolate opacity-80"
                                  >
                                    <span className={cn("text-xs font-semibold text-white/90 truncate drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]", roleFlashClass(roleFlashMap.get(p.id)))}>{name}</span>
                                    {roleFlashMap.get(p.id) && (
                                      <span className="text-[9px] font-medium uppercase tracking-wider text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">
                                        {formatRoleLabel(roleFlashMap.get(p.id))}
                                      </span>
                                    )}
                                    <div className="text-[10px] text-white/70 drop-shadow-[0_1px_1px_rgba(0,0,0,0.6)]">Off duty</div>
                                  </Nameplate>
                                  <DndCountdown userId={p.id} compact className="mt-1" />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

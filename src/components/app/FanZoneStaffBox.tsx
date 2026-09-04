import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shield, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useFanProfileTo } from "@/components/app/fan-profile-link";
import { useOnlineUsers } from "@/hooks/use-online-users";
import { useLastSeenMap } from "@/hooks/use-last-seen-map";
import { formatLastSeen } from "@/lib/relative-time";

type StaffMember = {
  user_id: string;
  role: "admin" | "boro_fan_zone_moderator";
  fan_alias: string;
  fan_avatar_url: string;
};

/** Side box listing Owners and Boro Fan Zone Moderators with mini cards. */
export function FanZoneStaffBox() {
  const profileTo = useFanProfileTo();
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const online = useOnlineUsers();
  const staffIds = useMemo(() => (members ?? []).map((m) => m.user_id), [members]);
  const { lastSeen, tick } = useLastSeenMap(staffIds);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.rpc("fan_zone_staff_directory");
      const out: StaffMember[] = ((data ?? []) as Array<{
        user_id: string;
        role: StaffMember["role"];
        fan_alias: string;
        fan_avatar_url: string;
      }>).map((r) => ({
        user_id: r.user_id,
        role: r.role,
        fan_alias: r.fan_alias,
        fan_avatar_url: r.fan_avatar_url,
      }));
      // Owners first, then moderators; alphabetical within each
      out.sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.fan_alias.toLowerCase().localeCompare(b.fan_alias.toLowerCase());
      });
      setMembers(out);
    })();
  }, []);

  if (!members || members.length === 0) return null;

  return (
    <aside className="boro-solid-panel rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-[#E11B22] to-[#8B0F14] text-white">
        <h3 className="font-display text-sm font-bold uppercase tracking-wider flex items-center gap-2">
          <Shield className="size-4" /> Fan Zone Staff
        </h3>
      </div>
      <ul className="p-2 space-y-1.5">
        {members.map((m) => {
          const name = m.fan_alias;
          const isAdmin = m.role === "admin";
          const initials = name.slice(0, 2).toUpperCase();
          const isOnline = online.has(m.user_id);
          const seenText = formatLastSeen(lastSeen[m.user_id] ?? null);
          const inner = (
            <div className="flex items-center gap-2.5 rounded-lg border border-white/[0.12] bg-white/[0.08] px-2.5 py-2 hover:border-[#E11B22]/60 hover:bg-white/[0.12] transition-colors">
              <div className="relative shrink-0">
                {m.fan_avatar_url ? (
                  <img
                    src={m.fan_avatar_url}
                    alt=""
                    className="size-9 rounded-full object-cover ring-2 ring-[#E11B22]/40"
                  />
                ) : (
                  <div className="size-9 rounded-full bg-gradient-to-br from-[#E11B22] to-[#8B0F14] grid place-items-center text-white text-xs font-bold ring-2 ring-[#E11B22]/40">
                    {initials}
                  </div>
                )}
                {isAdmin && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-amber-400 grid place-items-center ring-2 ring-surface-1">
                    <Star className="size-2.5 text-amber-900" fill="currentColor" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate leading-tight">{name}</div>
                <div className={`text-[10px] uppercase tracking-wider font-bold ${isAdmin ? "text-amber-400" : "text-[#E11B22]"}`}>
                  {isAdmin ? "Owner" : "Fan Zone Mod"}
                </div>
                <div
                  className={`mt-0.5 text-[10px] font-medium ${isOnline ? "text-emerald-400" : "text-white/55"}`}
                >
                  {isOnline ? "Online" : `Away · ${seenText}`}
                </div>
              </div>
            </div>
          );
          return (
            <li key={`${m.user_id}-${m.role}`}>
              <Link to={profileTo} params={{ userId: m.user_id }} aria-label={`View ${name}'s profile`}>
                {inner}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
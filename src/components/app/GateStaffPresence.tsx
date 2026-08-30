import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { UserCog } from "lucide-react";
import { getGateStaffPresence, type GateStaffPresenceEntry } from "@/lib/gate-staff-presence.functions";

const ROLE_LABEL: Record<string, string> = {
  admin: "Owner",
  management: "Management",
};

export function GateStaffPresence() {
  const fetchPresence = useServerFn(getGateStaffPresence);
  const [staff, setStaff] = useState<GateStaffPresenceEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await fetchPresence();
        if (!cancelled) setStaff(rows);
      } catch {
        /* keep previous state */
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [fetchPresence]);

  if (staff.length === 0) return null;

  const onlineCount = staff.filter((s) => s.online || s.on_shift).length;

  return (
    <div className="w-full rounded-lg border border-white/15 bg-white/5 p-3 text-left shadow-[0_0_24px_rgba(0,0,0,0.35)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <UserCog className="size-4 text-emerald-400" />
          Staff availability
        </div>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            onlineCount > 0
              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/40"
              : "bg-white/10 text-white/60 border border-white/15"
          }`}
        >
          {onlineCount > 0 ? `${onlineCount} online` : "All offline"}
        </span>
      </div>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {staff.map((s) => {
          const active = s.online || s.on_shift;
          return (
            <div
              key={s.user_id}
              className="flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/30 py-1 pl-1 pr-3"
            >
              <div className="relative">
                {s.avatar_url ? (
                  <img
                    src={s.avatar_url}
                    alt={s.display_name}
                    className="size-6 rounded-full object-cover"
                  />
                ) : (
                  <div className="size-6 rounded-full bg-white/10 grid place-items-center text-[10px] font-bold text-white/70">
                    {s.display_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-black ${
                    active ? "bg-emerald-400" : "bg-zinc-500"
                  }`}
                />
              </div>
              <div className="leading-tight">
                <div className="text-xs font-medium text-white">{s.display_name}</div>
                <div className={`text-[10px] ${active ? "text-emerald-300/90" : "text-white/40"}`}>
                  {ROLE_LABEL[s.role] ?? "Staff"} · {active ? "Online" : "Offline"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

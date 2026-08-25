import { Shield, ShieldCheck } from "lucide-react";

export type FanStaffRole = "admin" | "boro_fan_zone_moderator";

/** Small badge showing a Fan Zone staff role (Owner / Fan Zone Moderator) with an icon. */
export function FanRoleBadge({ role, className = "" }: { role: FanStaffRole | null | undefined; className?: string }) {
  if (!role) return null;
  const isAdmin = role === "admin";
  const Icon = isAdmin ? ShieldCheck : Shield;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
        isAdmin
          ? "border-amber-300/60 bg-amber-400/20 text-amber-100"
          : "border-white/40 bg-white/15 text-white"
      } ${className}`}
    >
      <Icon className="size-3.5" />
      {isAdmin ? "Owner" : "Fan Zone Moderator"}
    </span>
  );
}

import { Shield, ShieldCheck } from "lucide-react";

/**
 * Roles that can be shown on a Fan Zone profile. BM Support roles outrank the
 * Fan Zone ones, so a user holding both is badged with their support role.
 */
export type FanStaffRole =
  | "admin"
  | "management"
  | "moderator"
  | "staff"
  | "boro_fan_zone_moderator";

const LABELS: Record<FanStaffRole, string> = {
  admin: "Owner",
  management: "Management",
  moderator: "Moderator",
  staff: "Staff",
  boro_fan_zone_moderator: "Fan Zone Moderator",
};

const STYLES: Record<FanStaffRole, string> = {
  admin: "border-amber-300/60 bg-amber-400/20 text-amber-100",
  management: "border-fuchsia-300/60 bg-fuchsia-400/20 text-fuchsia-100",
  moderator: "border-sky-300/60 bg-sky-400/20 text-sky-100",
  staff: "border-emerald-300/60 bg-emerald-400/20 text-emerald-100",
  boro_fan_zone_moderator: "border-white/40 bg-white/15 text-white",
};

/** Small badge showing the highest role a Fan Zone user holds, with an icon. */
export function FanRoleBadge({ role, className = "" }: { role: FanStaffRole | null | undefined; className?: string }) {
  if (!role) return null;
  const Icon = role === "boro_fan_zone_moderator" ? Shield : ShieldCheck;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${STYLES[role]} ${className}`}
    >
      <Icon className="size-3.5" />
      {LABELS[role]}
    </span>
  );
}

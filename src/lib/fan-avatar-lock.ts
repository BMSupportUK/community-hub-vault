import { useAuth } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";
import moderatorAvatarAsset from "@/assets/moderator-avatar.png.asset.json";

/** Fixed avatar every Fan Zone moderator uses. */
export const MODERATOR_AVATAR_URL = moderatorAvatarAsset.url;

/** Staff roles that may not change their Fan Zone avatar. */
export const AVATAR_LOCKED_ROLES = [
  "admin",
  "management",
  "staff",
  "moderator",
  "boro_fan_zone_moderator",
] as const;

type AppRole = Database["public"]["Enums"]["app_role"];

const MODERATOR_ROLES = ["moderator", "boro_fan_zone_moderator"] as const;

/** Whether the signed-in user's avatar is locked, and which avatar it is forced to. */
export function useFanAvatarLock() {
  const { hasAny } = useAuth();
  const isModerator = hasAny(MODERATOR_ROLES as unknown as AppRole[]);
  const locked = hasAny(AVATAR_LOCKED_ROLES as unknown as AppRole[]);
  return {
    locked,
    isModerator,
    forcedAvatar: isModerator ? MODERATOR_AVATAR_URL : null,
    lockMessage: isModerator
      ? "Moderators use the official Moderator badge picture — it can't be changed."
      : "Staff accounts can't change their Fan Zone picture.",
  };
}

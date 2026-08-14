import { useAuth } from "@/hooks/use-auth";
import moderatorAvatarAsset from "@/assets/moderator-avatar.png.asset.json";
import adminAvatarAsset from "@/assets/admin-avatar.png.asset.json";

/** Fixed avatar every Fan Zone moderator uses. */
export const MODERATOR_AVATAR_URL = moderatorAvatarAsset.url;

/** Fixed avatar every admin account uses. */
export const ADMIN_AVATAR_URL = adminAvatarAsset.url;

/** Staff roles that may not change their Fan Zone avatar. */
export const AVATAR_LOCKED_ROLES = [
  "admin",
  "management",
  "staff",
  "moderator",
  "boro_fan_zone_moderator",
] as const;

const MODERATOR_ROLES = ["moderator", "boro_fan_zone_moderator"] as const;

/** Whether the signed-in user's avatar is locked, and which avatar it is forced to. */
export function useFanAvatarLock() {
  const { hasAny } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const isModerator = hasAny([...MODERATOR_ROLES]);
  const locked = hasAny([...AVATAR_LOCKED_ROLES]);
  return {
    locked,
    isModerator,
    isAdmin,
    forcedAvatar: isAdmin ? ADMIN_AVATAR_URL : isModerator ? MODERATOR_AVATAR_URL : null,
    lockMessage: isAdmin
      ? "Admins use the official Admin badge picture — it can't be changed."
      : isModerator
        ? "Moderators use the official Moderator badge picture — it can't be changed."
        : "Staff accounts can't change their Fan Zone picture.",
  };
}

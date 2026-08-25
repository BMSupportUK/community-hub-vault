import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ProtectedRole = "admin" | "management" | "moderator" | "boro_fan_zone_moderator";

const ROLE_LABEL: Record<ProtectedRole, string> = {
  admin: "Owner",
  management: "Management",
  moderator: "Moderator",
  boro_fan_zone_moderator: "Fan Zone Moderator",
};

export function protectedRoleLabel(role: ProtectedRole | null | undefined) {
  return role ? ROLE_LABEL[role] : "";
}

let cache: Map<string, ProtectedRole> | null = null;
let inflight: Promise<Map<string, ProtectedRole>> | null = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = (async () => {
      try {
        const { data } = await supabase.rpc("fan_zone_protected_user_ids");
        const map = new Map<string, ProtectedRole>();
        ((data ?? []) as Array<{ user_id: string; role: string }>).forEach((r) => {
          const role = r.role as ProtectedRole;
          // Admin outranks the rest when a user holds several roles.
          if (role === "admin" || !map.has(r.user_id)) map.set(r.user_id, role);
        });
        cache = map;
        return map;
      } catch {
        return new Map<string, ProtectedRole>();
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/**
 * Admins, management and moderators are protected — members can't block them.
 * Returns a lookup so the UI can flag those accounts before attempting a block.
 */
export function useProtectedUsers() {
  const [map, setMap] = useState<Map<string, ProtectedRole>>(() => cache ?? new Map());

  useEffect(() => {
    let alive = true;
    void load().then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);

  return {
    protectedRoleOf: (id: string | null | undefined) => (id ? map.get(id) ?? null : null),
    isProtected: (id: string | null | undefined) => !!id && map.has(id),
  };
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FlashRole = "admin" | "management" | "moderator" | "staff";
const PRIORITY: FlashRole[] = ["admin", "management", "moderator", "staff"];

let cache: Map<string, FlashRole> | null = null;
let inflight: Promise<Map<string, FlashRole>> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<Map<string, FlashRole>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", PRIORITY);
    const map = new Map<string, FlashRole>();
    for (const row of (data ?? []) as { user_id: string; role: FlashRole }[]) {
      const cur = map.get(row.user_id);
      if (!cur || PRIORITY.indexOf(row.role) < PRIORITY.indexOf(cur)) {
        map.set(row.user_id, row.role);
      }
    }
    cache = map;
    inflight = null;
    for (const l of listeners) l();
    return map;
  })();
  return inflight;
}

export function useRoleFlashMap(): Map<string, FlashRole> {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!cache) load();
    // Refresh on focus to pick up role changes.
    const onFocus = () => { cache = null; load(); };
    window.addEventListener("focus", onFocus);
    return () => {
      listeners.delete(l);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
  return cache ?? new Map();
}

export function roleFlashClass(role: FlashRole | null | undefined): string {
  if (!role) return "";
  return `role-name-flash-${role}`;
}

import { STAFF_DEFAULT_AVATAR_URL, MANAGEMENT_DEFAULT_AVATAR_URL, MODERATOR_DEFAULT_AVATAR_URL, DEFAULT_AVATAR_URL } from "@/lib/default-avatar";

/** Returns the avatar URL to display. If the user has the `staff` role
 * (and is not higher: admin/management/moderator) and has no avatar set,
 * returns the staff-branded default. */
export function resolveAvatarUrl(
  userId: string | null | undefined,
  avatarUrl: string | null | undefined,
  roleMap: Map<string, FlashRole>,
): string {
  if (avatarUrl) return avatarUrl;
  if (userId) {
    const role = roleMap.get(userId);
    if (role === "management") return MANAGEMENT_DEFAULT_AVATAR_URL;
    if (role === "moderator") return MODERATOR_DEFAULT_AVATAR_URL;
    if (role === "staff") return STAFF_DEFAULT_AVATAR_URL;
  }
  return DEFAULT_AVATAR_URL;
}
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FlashRole = "admin" | "management" | "moderator" | "staff";
const PRIORITY: FlashRole[] = ["admin", "management", "moderator", "staff"];

let cache: Map<string, FlashRole> | null = null;
let inflight: Promise<Map<string, FlashRole>> | null = null;
const listeners = new Set<() => void>();

async function load(refresh = false): Promise<Map<string, FlashRole>> {
  if (cache && !refresh) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", PRIORITY);
    // A wake-up refresh must not erase the displayed roles, colours or
    // branded avatars while the request is pending or if it fails.
    if (error) throw error;
    const map = new Map<string, FlashRole>();
    for (const row of (data ?? []) as { user_id: string; role: FlashRole }[]) {
      const cur = map.get(row.user_id);
      if (!cur || PRIORITY.indexOf(row.role) < PRIORITY.indexOf(cur)) {
        map.set(row.user_id, row.role);
      }
    }
    cache = map;
    for (const l of listeners) l();
    return map;
  })().catch((error) => {
    console.error("Could not refresh staff display roles", error);
    return cache ?? new Map<string, FlashRole>();
  }).finally(() => {
    inflight = null;
  });
  return inflight;
}

// A single shared realtime subscription, ref-counted across all consumers.
// Creating one channel per hook instance reuses the same topic and throws
// "cannot add `postgres_changes` callbacks ... after `subscribe()`".
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let subscriberCount = 0;

function reloadRoles() {
  void load(true);
}

function acquireSubscription() {
  subscriberCount += 1;
  if (sharedChannel) return;
  sharedChannel = supabase
    .channel(`role-flash-roles-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, reloadRoles)
    .subscribe();
  window.addEventListener("focus", reloadRoles);
}

function releaseSubscription() {
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount === 0 && sharedChannel) {
    const ch = sharedChannel;
    sharedChannel = null;
    window.removeEventListener("focus", reloadRoles);
    void supabase.removeChannel(ch);
  }
}

export function useRoleFlashMap(): Map<string, FlashRole> {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (!cache) load();
    acquireSubscription();
    return () => {
      listeners.delete(l);
      releaseSubscription();
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
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
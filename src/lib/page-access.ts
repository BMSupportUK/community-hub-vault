import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PagePermMap = Record<string, string[]>;

let cached: PagePermMap | null = null;
let inflight: Promise<PagePermMap> | null = null;
const listeners = new Set<() => void>();
let realtimeStarted = false;
let labels: Record<string, string> = {};

/** The name the owner gave a page in Role permissions (falls back to the key). */
export function pagePermissionLabel(key: string): string {
  return labels[key] ?? key.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function load(): Promise<PagePermMap> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase.from("page_permissions").select("page_key,allowed_roles,label");
    const map: PagePermMap = {};
    const names: Record<string, string> = {};
    (data ?? []).forEach((r: { page_key: string; allowed_roles: string[] | null; label: string | null }) => {
      map[r.page_key] = r.allowed_roles ?? [];
      if (r.label) names[r.page_key] = r.label;
    });
    labels = names;
    cached = map;
    inflight = null;
    for (const l of listeners) l();
    return map;
  })();
  return inflight;
}

export function refreshPagePermissions() {
  cached = null;
  void load();
}

/** Reload the shared map whenever the owner changes any page permission. */
function ensureRealtime() {
  if (realtimeStarted) return;
  realtimeStarted = true;
  supabase
    .channel("page-permissions-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "page_permissions" }, () => {
      refreshPagePermissions();
    })
    .subscribe();
}

/** Shared, cached page-permission map. Returns null until it has loaded. Updates live. */
export function usePagePermissions(): PagePermMap | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    ensureRealtime();
    if (!cached) void load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return cached;
}

/** Page key for a pathname: the first path segment (e.g. /sports-guides/read/5 -> sports-guides). */
export function pageKeyForPath(path: string): string {
  return path.replace(/^\//, "").split("/")[0] ?? "";
}

/**
 * True when the roles may open the page.
 * A page that is registered but has no roles ticked is owner/management only.
 * A page that is not registered at all is left open (nothing to enforce).
 */
export function isPageAllowed(
  pageKey: string,
  roles: readonly string[],
  perms: PagePermMap | null,
): boolean {
  if (!perms) return true; // still loading — don't flash a redirect
  const allowed = perms[pageKey];
  if (!allowed) return true;
  if (roles.some((r) => r === "admin")) return true;
  return roles.some((r) => allowed.includes(r));
}

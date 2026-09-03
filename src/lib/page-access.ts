import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PagePermMap = Record<string, string[]>;

let cached: PagePermMap | null = null;
let inflight: Promise<PagePermMap> | null = null;
const listeners = new Set<() => void>();

async function load(): Promise<PagePermMap> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data } = await supabase.from("page_permissions").select("page_key,allowed_roles");
    const map: PagePermMap = {};
    (data ?? []).forEach((r: { page_key: string; allowed_roles: string[] | null }) => {
      map[r.page_key] = r.allowed_roles ?? [];
    });
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

/** Shared, cached page-permission map. Returns null until it has loaded. */
export function usePagePermissions(): PagePermMap | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
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
  if (roles.some((r) => r === "admin" || r === "management")) return true;
  return roles.some((r) => allowed.includes(r));
}

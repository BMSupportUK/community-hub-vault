import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "landing_nav_order";

let cache: string[] | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<(order: string[] | null) => void>();

function normalize(v: unknown): string[] | null {
  if (!v || typeof v !== "object") return null;
  const order = (v as { order?: unknown }).order;
  if (!Array.isArray(order)) return null;
  const paths = order.filter((p): p is string => typeof p === "string");
  return paths.length ? paths : null;
}

async function load() {
  if (loading) return loading;
  loading = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    cache = normalize(data?.value);
    loaded = true;
    listeners.forEach((l) => l(cache));
  })();
  return loading;
}

export function useLandingNavOrder() {
  const [order, setOrder] = useState<string[] | null>(cache);
  useEffect(() => {
    listeners.add(setOrder);
    if (!loaded) void load();
    return () => {
      listeners.delete(setOrder);
    };
  }, []);
  return order;
}

export async function setLandingNavOrder(order: string[]) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: KEY, value: { order } as never }, { onConflict: "key" });
  if (error) throw error;
  cache = order;
  listeners.forEach((l) => l(cache));
}

/** Sort nav items by the saved order; unknown paths keep their relative position at the end. */
export function applyNavOrder<T extends { to: string }>(items: T[], order: string[] | null): T[] {
  if (!order) return items;
  const rank = new Map(order.map((p, i) => [p, i]));
  return [...items].sort((a, b) => {
    const ra = rank.has(a.to) ? rank.get(a.to)! : order.length;
    const rb = rank.has(b.to) ? rank.get(b.to)! : order.length;
    return ra - rb;
  });
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface NameplateRow {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  gradient_css: string | null;
  is_active: boolean;
  sort_order: number;
}

const cache = new Map<string, NameplateRow | null>();
const pending = new Map<string, Promise<NameplateRow | null>>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

async function fetchOne(id: string): Promise<NameplateRow | null> {
  if (cache.has(id)) return cache.get(id) ?? null;
  if (pending.has(id)) return pending.get(id)!;
  const p = (async () => {
    const { data } = await supabase
      .from("nameplates")
      .select("id,name,description,image_url,gradient_css,is_active,sort_order")
      .eq("id", id)
      .maybeSingle();
    const row = (data as NameplateRow | null) ?? null;
    cache.set(id, row);
    pending.delete(id);
    notify();
    return row;
  })();
  pending.set(id, p);
  return p;
}

export function primeNameplates(rows: NameplateRow[]) {
  for (const r of rows) cache.set(r.id, r);
  notify();
}

export function clearNameplateCache() {
  cache.clear();
  pending.clear();
  notify();
}

export function useNameplate(id: string | null | undefined): NameplateRow | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    if (id && !cache.has(id)) {
      fetchOne(id);
    }
    return () => {
      listeners.delete(l);
    };
  }, [id]);
  if (!id) return null;
  return cache.get(id) ?? null;
}

export function nameplateBackgroundStyle(np: NameplateRow | null | undefined): React.CSSProperties | undefined {
  if (!np) return undefined;
  if (np.image_url) {
    return {
      backgroundImage: `url(${np.image_url})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  if (np.gradient_css) {
    return { background: np.gradient_css };
  }
  return undefined;
}
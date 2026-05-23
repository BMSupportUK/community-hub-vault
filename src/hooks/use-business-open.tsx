import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;
const listeners = new Set<(v: boolean) => void>();

async function fetchOpen(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc("is_business_open");
      const v = !error && data === true;
      cached = v;
      for (const l of listeners) l(v);
      return v;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Returns true when the business is currently open per admin-configured hours. */
export function useBusinessOpen(): boolean {
  const [open, setOpen] = useState<boolean>(cached ?? true);
  useEffect(() => {
    const l = (v: boolean) => setOpen(v);
    listeners.add(l);
    fetchOpen().then(setOpen);
    const id = setInterval(() => fetchOpen(), 60_000);
    return () => {
      listeners.delete(l);
      clearInterval(id);
    };
  }, []);
  return open;
}
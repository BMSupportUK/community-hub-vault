import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "install_guides_alternative_methods";
let cache = false;
let loaded = false;
const listeners = new Set<(v: boolean) => void>();

async function load() {
  const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
  cache = (data?.value as { enabled?: boolean } | null)?.enabled === true;
  loaded = true;
  listeners.forEach((l) => l(cache));
}

/** Whether Install Guides shows "Alternative Install methods" (hidden unless an admin turns it on). */
export function useAlternativeInstallEnabled() {
  const [on, setOn] = useState(cache);
  useEffect(() => {
    listeners.add(setOn);
    if (!loaded) void load();
    return () => { listeners.delete(setOn); };
  }, []);
  return on;
}

export async function setAlternativeInstallEnabled(enabled: boolean) {
  const { error } = await supabase.from("app_settings").upsert({ key: KEY, value: { enabled } as never }, { onConflict: "key" });
  if (error) throw error;
  cache = enabled;
  listeners.forEach((l) => l(cache));
}

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppTheme = "purple" | "red";
const DEFAULT: AppTheme = "purple";
const KEY = "app_theme";

let cache: AppTheme = DEFAULT;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<(t: AppTheme) => void>();

function apply(t: AppTheme) {
  cache = t;
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    html.classList.toggle("theme-red", t === "red");
  }
  listeners.forEach((l) => l(t));
}

async function load() {
  if (loading) return loading;
  loading = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", KEY)
      .maybeSingle();
    const v = (data?.value as { theme?: AppTheme } | null) ?? null;
    apply(v?.theme === "red" ? "red" : "purple");
    loaded = true;
  })();
  return loading;
}

let channelStarted = false;
function startChannel() {
  if (channelStarted) return;
  channelStarted = true;
  supabase
    .channel("app_settings-theme")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_settings", filter: `key=eq.${KEY}` },
      (payload) => {
        const v = ((payload.new as { value?: { theme?: AppTheme } } | null)?.value) ?? null;
        apply(v?.theme === "red" ? "red" : "purple");
      },
    )
    .subscribe();
}

export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(cache);
  useEffect(() => {
    listeners.add(setTheme);
    if (!loaded) load();
    startChannel();
    return () => { listeners.delete(setTheme); };
  }, []);
  return theme;
}

export async function setAppTheme(theme: AppTheme) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: KEY, value: { theme } as never }, { onConflict: "key" });
  if (error) throw error;
  apply(theme);
}
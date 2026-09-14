import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppTheme = "purple" | "red" | "ocean" | "sunset" | "pink" | "berry";
const THEMES: AppTheme[] = ["purple", "red", "ocean", "sunset", "pink", "berry"];
function normalize(v: unknown): AppTheme {
  return THEMES.includes(v as AppTheme) ? (v as AppTheme) : "purple";
}
const DEFAULT: AppTheme = "purple";
const KEY = "app_theme";
const STORAGE_KEY = "bm_app_theme";

let cache: AppTheme = DEFAULT;
let defaultCache: AppTheme = DEFAULT;
let personalCache: AppTheme | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<(t: AppTheme) => void>();
const defaultListeners = new Set<(t: AppTheme) => void>();

function apply(t: AppTheme) {
  cache = t;
  if (typeof document !== "undefined") {
    const html = document.documentElement;
    html.classList.remove("theme-red", "theme-ocean", "theme-sunset", "theme-pink", "theme-berry");
    if (t !== "purple") html.classList.add(`theme-${t}`);
  }
  listeners.forEach((l) => l(t));
}

function hydrateCache() {
  if (loaded || typeof window === "undefined") return;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) apply(normalize(stored));
  } catch {
    // Ignore storage failures.
  }
}

function persistTheme(theme: AppTheme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures.
  }
}

function applyResolvedTheme() {
  apply(personalCache ?? defaultCache);
  persistTheme(personalCache ?? defaultCache);
}

async function loadPersonalTheme() {
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  if (!userId) {
    personalCache = null;
    applyResolvedTheme();
    return;
  }
  const { data } = await supabase
    .from("profiles")
    .select("preferred_theme")
    .eq("id", userId)
    .maybeSingle();
  personalCache = data?.preferred_theme ? normalize(data.preferred_theme) : null;
  applyResolvedTheme();
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
    defaultCache = normalize(v?.theme);
    defaultListeners.forEach((listener) => listener(defaultCache));
    await loadPersonalTheme();
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
        defaultCache = normalize(v?.theme);
        defaultListeners.forEach((listener) => listener(defaultCache));
        applyResolvedTheme();
      },
    )
    .subscribe();
}

export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(cache);
  useEffect(() => {
    hydrateCache();
    setTheme(cache);
    listeners.add(setTheme);
    const start = () => {
      if (!loaded) void load();
      startChannel();
    };
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number }).requestIdleCallback;
    const idleId = idle ? idle(start, { timeout: 4000 }) : window.setTimeout(start, 2000);
    return () => {
      listeners.delete(setTheme);
      if (idle) {
        (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(idleId as number);
      } else {
        window.clearTimeout(idleId as number);
      }
    };
  }, []);
  return theme;
}

export function useDefaultAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(defaultCache);
  useEffect(() => {
    defaultListeners.add(setTheme);
    const start = () => {
      if (!loaded) void load();
      startChannel();
    };
    start();
    return () => {
      defaultListeners.delete(setTheme);
    };
  }, []);
  return theme;
}

export async function setAppTheme(theme: AppTheme) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: KEY, value: { theme } as never }, { onConflict: "key" });
  if (error) throw error;
  defaultCache = theme;
  defaultListeners.forEach((listener) => listener(theme));
  applyResolvedTheme();
}

export async function setPersonalAppTheme(theme: AppTheme) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("You must be signed in to save a theme");
  const { error } = await supabase
    .from("profiles")
    .update({ preferred_theme: theme })
    .eq("id", authData.user.id);
  if (error) throw error;
  personalCache = theme;
  applyResolvedTheme();
}

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_IN" || event === "USER_UPDATED") void loadPersonalTheme();
  if (event === "SIGNED_OUT") {
    personalCache = null;
    applyResolvedTheme();
  }
});
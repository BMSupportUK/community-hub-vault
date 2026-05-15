import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface TimezoneSetting {
  tz: string;
}

const DEFAULT: TimezoneSetting = { tz: "Europe/London" };

let cache: TimezoneSetting | null = null;
const listeners = new Set<(t: TimezoneSetting) => void>();
let loaded = false;
let loading: Promise<void> | null = null;

function emit(t: TimezoneSetting) {
  cache = t;
  listeners.forEach((l) => l(t));
}

async function load() {
  if (loading) return loading;
  loading = (async () => {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "timezone")
      .maybeSingle();
    const v = (data?.value as Partial<TimezoneSetting> | null) ?? null;
    emit({ tz: v?.tz || DEFAULT.tz });
    loaded = true;
  })();
  return loading;
}

let channelStarted = false;
function startChannel() {
  if (channelStarted) return;
  channelStarted = true;
  supabase
    .channel("app_settings-timezone")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "app_settings", filter: "key=eq.timezone" },
      (payload) => {
        const v = ((payload.new as { value?: Partial<TimezoneSetting> } | null)?.value) ?? null;
        if (!v) return;
        emit({ tz: v.tz || DEFAULT.tz });
      },
    )
    .subscribe();
}

/**
 * Convert a wall-clock (date + time) interpreted in `tz` to a UTC ms timestamp.
 * Example: ("2026-05-15", "14:00", "Europe/London") -> ms representing 14:00 London time.
 */
export function zonedWallTimeToUtcMs(dateStr: string, timeStr: string, tz: string): number {
  // Treat the wall time as if it were UTC first.
  const naiveUtc = new Date(`${dateStr}T${timeStr}Z`).getTime();
  if (isNaN(naiveUtc)) return NaN;
  // Format that instant in the target timezone and read back the wall time it shows.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(naiveUtc));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const hour = parseInt(get("hour"), 10) % 24; // some locales return "24" for midnight
  const asUtc = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    hour,
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10),
  );
  const offset = asUtc - naiveUtc;
  return naiveUtc - offset;
}

export function useTimezone() {
  const [timezone, setTimezone] = useState<TimezoneSetting>(cache ?? DEFAULT);

  useEffect(() => {
    listeners.add(setTimezone);
    if (!loaded) load();
    startChannel();
    return () => {
      listeners.delete(setTimezone);
    };
  }, []);

  return {
    tz: timezone.tz,
    toUtcMs: (dateStr: string, timeStr: string) => zonedWallTimeToUtcMs(dateStr, timeStr, timezone.tz),
  };
}
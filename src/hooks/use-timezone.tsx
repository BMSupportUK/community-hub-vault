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

function normalizeTime(timeStr: string): string {
  const [hours = "0", minutes = "0", seconds = "0"] = timeStr.split(":");
  return `${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}:${seconds.slice(0, 2).padStart(2, "0")}`;
}

function zonedParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  return {
    year: parseInt(get("year"), 10),
    month: parseInt(get("month"), 10),
    day: parseInt(get("day"), 10),
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    second: parseInt(get("second"), 10),
  };
}

function timeZoneOffsetMs(instantMs: number, tz: string): number {
  const p = zonedParts(new Date(instantMs), tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instantMs;
}

export function dateInTimeZone(date: Date | number, tz: string): string {
  const p = zonedParts(typeof date === "number" ? new Date(date) : date, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function addDaysToDateStr(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Convert a wall-clock (date + time) interpreted in `tz` to a UTC ms timestamp.
 * Example: ("2026-05-15", "14:00", "Europe/London") -> ms representing 14:00 London time.
 */
export function zonedWallTimeToUtcMs(dateStr: string, timeStr: string, tz: string): number {
  // Treat the wall time as if it were UTC first, then subtract the target zone offset.
  const naiveUtc = new Date(`${dateStr}T${normalizeTime(timeStr)}Z`).getTime();
  if (isNaN(naiveUtc)) return NaN;
  let utc = naiveUtc;
  for (let i = 0; i < 3; i += 1) {
    const next = naiveUtc - timeZoneOffsetMs(utc, tz);
    if (Math.abs(next - utc) < 1) return next;
    utc = next;
  }
  return utc;
}

export function shiftWindowToUtcMs(dateStr: string, startTime: string, endTime: string, tz: string) {
  const startsAt = zonedWallTimeToUtcMs(dateStr, startTime, tz);
  let endsAt = zonedWallTimeToUtcMs(dateStr, endTime, tz);
  if (!isNaN(startsAt) && !isNaN(endsAt) && endsAt <= startsAt) {
    endsAt = zonedWallTimeToUtcMs(addDaysToDateStr(dateStr, 1), endTime, tz);
  }
  return { startsAt, endsAt };
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
    shiftWindowToUtcMs: (dateStr: string, startTime: string, endTime: string) => shiftWindowToUtcMs(dateStr, startTime, endTime, timezone.tz),
    dateInTimeZone: (date: Date | number) => dateInTimeZone(date, timezone.tz),
  };
}
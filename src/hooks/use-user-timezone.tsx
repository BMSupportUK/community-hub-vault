import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const cache = new Map<string, string>();
const USER_TIMEZONE_EVENT = "bm-user-timezone-change";

export function announceUserTimezone(userId: string, timezone: string) {
  cache.set(userId, timezone);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(USER_TIMEZONE_EVENT, { detail: { userId, timezone } }));
  }
}

/** Returns the signed-in user's saved timezone, falling back to the browser timezone. */
export function useUserTimezone(): string {
  const { user } = useAuth();
  const [tz, setTz] = useState<string>(() => (user && cache.get(user.id)) || browserTimezone());

  useEffect(() => {
    const detected = browserTimezone();
    if (!user) {
      setTz(detected);
      return;
    }
    let active = true;
    const apply = (next: string) => {
      cache.set(user.id, next);
      if (active) setTz(next);
    };
    const onTimezoneChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; timezone?: string }>).detail;
      if (detail?.userId === user.id && detail.timezone) apply(detail.timezone);
    };
    window.addEventListener(USER_TIMEZONE_EVENT, onTimezoneChange);
    supabase
      .from("profiles")
      .select("timezone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const saved = (data as { timezone?: string | null } | null)?.timezone;
        apply(saved || detected);
      });
    const ch = supabase
      .channel(`profile-tz-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
        (payload) => {
          const saved = (payload.new as { timezone?: string | null } | null)?.timezone;
          apply(saved || browserTimezone());
        },
      )
      .subscribe();
    return () => {
      active = false;
      window.removeEventListener(USER_TIMEZONE_EVENT, onTimezoneChange);
      supabase.removeChannel(ch);
    };
  }, [user]);

  return tz;
}

export function listTimeZones(): string[] {
  const anyIntl = Intl as unknown as { supportedValuesOf?: (k: string) => string[] };
  if (typeof anyIntl.supportedValuesOf === "function") {
    try {
      return anyIntl.supportedValuesOf("timeZone");
    } catch {
      /* noop */
    }
  }
  return [
    "UTC",
    "Europe/London",
    "Europe/Dublin",
    "Europe/Paris",
    "Europe/Berlin",
    "Europe/Madrid",
    "Europe/Rome",
    "Europe/Amsterdam",
    "Europe/Stockholm",
    "Europe/Athens",
    "Europe/Moscow",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "Asia/Dubai",
    "Asia/Kolkata",
    "Asia/Bangkok",
    "Asia/Singapore",
    "Asia/Hong_Kong",
    "Asia/Shanghai",
    "Asia/Tokyo",
    "Asia/Seoul",
    "Australia/Perth",
    "Australia/Sydney",
    "Pacific/Auckland",
    "America/Anchorage",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/Toronto",
    "America/Sao_Paulo",
    "America/Mexico_City",
  ];
}

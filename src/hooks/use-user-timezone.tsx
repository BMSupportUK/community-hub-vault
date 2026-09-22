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

const USER_TIMEZONE_EVENT = "bm-user-timezone-change";
const syncedTimezone = new Map<string, string>();

export function announceUserTimezone(userId: string, timezone: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(USER_TIMEZONE_EVENT, { detail: { userId, timezone } }));
  }
}

/** Returns the browser's current timezone and follows system timezone changes live. */
export function useUserTimezone(): string {
  const { user } = useAuth();
  const [tz, setTz] = useState("UTC");

  useEffect(() => {
    const syncDetectedTimezone = () => {
      const detected = browserTimezone();
      setTz((current) => current === detected ? current : detected);

      if (user && syncedTimezone.get(user.id) !== detected) {
        syncedTimezone.set(user.id, detected);
        void supabase
          .from("profiles")
          .update({ timezone: detected })
          .eq("id", user.id)
          .then(({ error }) => {
            if (error) syncedTimezone.delete(user.id);
          });
        announceUserTimezone(user.id, detected);
      }
    };

    const onTimezoneChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; timezone?: string }>).detail;
      if ((!user || detail?.userId === user.id) && detail?.timezone) setTz(detail.timezone);
    };

    syncDetectedTimezone();
    window.addEventListener(USER_TIMEZONE_EVENT, onTimezoneChange);
    const timer = window.setInterval(syncDetectedTimezone, 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncDetectedTimezone();
    };
    window.addEventListener("focus", syncDetectedTimezone);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener(USER_TIMEZONE_EVENT, onTimezoneChange);
      window.removeEventListener("focus", syncDetectedTimezone);
      document.removeEventListener("visibilitychange", onVisible);
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

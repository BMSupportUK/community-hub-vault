import { useCallback, useEffect, useRef, useState } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_TIMEOUT_MINUTES,
  STAFF_MAX_TIMEOUT_MINUTES,
} from "@/lib/screen-lock-hash";
import { ScreenLockOverlay } from "@/components/app/ScreenLockOverlay";

export interface ScreenLockSettings {
  enabled: boolean;
  timeout_minutes: number;
  code_hash: string | null;
  must_change: boolean;
}

export const LOCK_NOW_EVENT = "app:screen-lock-now";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;

/** Ask the app to lock immediately (used by the avatar menu). */
export function lockScreenNow() {
  window.dispatchEvent(new Event(LOCK_NOW_EVENT));
}

export function ScreenLockProvider() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const [settings, setSettings] = useState<ScreenLockSettings | null>(null);
  const [locked, setLocked] = useState(false);
  const timerRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const storageKey = user ? `screenlock:locked:${user.id}` : null;

  // Load (or create) this user's lock settings.
  useEffect(() => {
    if (!user) {
      setSettings(null);
      setLocked(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      let data: ScreenLockSettings | null = null;
      let loadError: { message: string } | null = null;

      // A session can still be hydrating when this provider first mounts. Never
      // mistake a failed read for a user who has not configured a lock code.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const result = await supabase
          .from("screen_lock_settings")
          .select("enabled, timeout_minutes, code_hash, must_change")
          .eq("user_id", user.id)
          .maybeSingle();
        data = result.data as ScreenLockSettings | null;
        loadError = result.error;
        if (!loadError) break;
        await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
      }
      if (cancelled) return;
      if (loadError) {
        console.error("Could not load screen lock settings", loadError);
        return;
      }
      if (data) {
        setSettings(data);
      } else {
        const row = {
          user_id: user.id,
          enabled: true,
          timeout_minutes: isStaff ? STAFF_MAX_TIMEOUT_MINUTES : DEFAULT_TIMEOUT_MINUTES,
        };
        const { data: created, error: createError } = await supabase
          .from("screen_lock_settings")
          .insert(row)
          .select("enabled, timeout_minutes, code_hash, must_change")
          .single();
        if (cancelled) return;
        if (createError || !created) {
          console.error("Could not create screen lock settings", createError);
          return;
        }
        setSettings(created as ScreenLockSettings);
      }
      // Restore a lock that was active before a reload.
      if (typeof window !== "undefined" && localStorage.getItem(`screenlock:locked:${user.id}`) === "1") {
        setLocked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isStaff]);

  // Live-update when settings change elsewhere (settings page, admin reset).
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`screen-lock-settings-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "screen_lock_settings", filter: `user_id=eq.${user.id}` },
        (p) => {
          const row = p.new as Partial<ScreenLockSettings> | null;
          if (
            row &&
            typeof row.enabled === "boolean" &&
            typeof row.timeout_minutes === "number" &&
            Object.prototype.hasOwnProperty.call(row, "code_hash") &&
            typeof row.must_change === "boolean"
          ) {
            setSettings(row as ScreenLockSettings);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const doLock = useCallback(
    (broadcast = true) => {
      setLocked(true);
      if (storageKey) localStorage.setItem(storageKey, "1");
      // A locked screen means the person is away from the PC: drop them out of
      // the Talk channel presence so member counters/lists don't count them.
      if (user) void suspendTalkPresence(user.id);
      if (broadcast) channelRef.current?.postMessage({ type: "lock" });
    },
    [storageKey, user?.id],
  );

  const doUnlock = useCallback(
    (broadcast = true) => {
      setLocked(false);
      if (storageKey) localStorage.removeItem(storageKey);
      resumeTalkPresence();
      if (broadcast) channelRef.current?.postMessage({ type: "unlock" });
    },
    [storageKey],
  );


  // Cross-tab sync
  useEffect(() => {
    if (!user || typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(`screenlock-${user.id}`);
    channelRef.current = ch;
    ch.onmessage = (ev: MessageEvent<{ type: string }>) => {
      if (ev.data?.type === "lock") doLock(false);
      if (ev.data?.type === "unlock") doUnlock(false);
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, [user?.id, doLock, doUnlock]);

  // Idle timer
  useEffect(() => {
    if (!user || !settings?.enabled || locked) return;
    const minutes = Math.max(1, settings.timeout_minutes || DEFAULT_TIMEOUT_MINUTES);
    const ms = minutes * 60_000;

    const reset = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => doLock(), ms);
    };
    reset();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user?.id, settings?.enabled, settings?.timeout_minutes, locked, doLock]);

  // Manual "Lock screen"
  useEffect(() => {
    const handler = () => doLock();
    window.addEventListener(LOCK_NOW_EVENT, handler);
    return () => window.removeEventListener(LOCK_NOW_EVENT, handler);
  }, [doLock]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (locked) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
    return;
  }, [locked]);

  if (!user || !locked || !settings) return null;

  return <ScreenLockOverlay settings={settings} onUnlock={() => doUnlock()} />;
}

/** Header pill: lock the app immediately before stepping away from the PC. */
export function LockNowPill() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <button
      type="button"
      onClick={() => lockScreenNow()}
      title="Lock the app now"
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-sky-500/15 border border-sky-500/40 text-sky-300 text-[11px] font-semibold hover:bg-sky-500/25 transition-colors"
    >
      <Lock className="size-3.5" />
      <span className="hidden xl:inline">Lock now</span>
    </button>
  );
}

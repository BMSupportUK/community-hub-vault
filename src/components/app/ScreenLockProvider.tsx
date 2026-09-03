import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_TIMEOUT_MINUTES,
  STAFF_MAX_TIMEOUT_MINUTES,
} from "@/lib/screen-lock-hash";
import { ScreenLockOverlay } from "@/components/app/ScreenLockOverlay";
import { resumeTalkPresence, suspendTalkPresence } from "@/hooks/use-talk-channel-presence";


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
      // Never leave a persisted lock flag behind after a sign-out: otherwise the
      // next sign-in locks instantly and the overlay looks permanently stuck.
      if (typeof window !== "undefined") {
        try {
          Object.keys(localStorage)
            .filter((k) => k.startsWith("screenlock:"))
            .forEach((k) => localStorage.removeItem(k));

        } catch {}
      }
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
      let active: ScreenLockSettings | null = null;
      if (data) {
        active = data;
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
        active = created as ScreenLockSettings;
        setSettings(active);
      }
      // Restore a lock that was active before a reload — but only when the lock
      // is still switched on. A stale flag must never trap the user.
      const flagKey = `screenlock:locked:${user.id}`;
      if (typeof window !== "undefined" && localStorage.getItem(flagKey) === "1") {
        if (active?.enabled) {
          setLocked(true);
          void suspendTalkPresence(user.id);
        } else {
          localStorage.removeItem(flagKey);
        }
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
      .channel(`screen-lock-settings-${user.id}-${Math.random().toString(36).slice(2)}`)
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
            // Turning the lock off elsewhere must release a currently locked screen.
            if (!row.enabled) {
              setLocked(false);
              try {
                localStorage.removeItem(`screenlock:locked:${user.id}`);
              } catch {}
              resumeTalkPresence();
            }
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
      // Restart the idle clock, otherwise the stale timestamp re-locks instantly.
      if (user) {
        try {
          localStorage.setItem(`screenlock:last-activity:${user.id}`, String(Date.now()));
        } catch {}
      }
      resumeTalkPresence();
      if (broadcast) channelRef.current?.postMessage({ type: "unlock" });
    },
    [storageKey, user?.id],
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

  // Idle timer.
  //
  // A plain setTimeout is not enough: background tabs get their timers throttled
  // or frozen, and the machine can sleep. So we track the wall-clock time of the
  // last real interaction (persisted, so a reload keeps counting) and poll it.
  useEffect(() => {
    if (!user || !settings?.enabled || locked) return;
    const minutes = Math.max(1, settings.timeout_minutes || DEFAULT_TIMEOUT_MINUTES);
    const ms = minutes * 60_000;
    const activityKey = `screenlock:last-activity:${user.id}`;

    const readLast = (): number => {
      try {
        const raw = localStorage.getItem(activityKey);
        const n = raw ? Number(raw) : NaN;
        if (Number.isFinite(n) && n > 0 && n <= Date.now()) return n;
      } catch {}
      return Date.now();
    };

    let lastActivity = readLast();
    // If the app was already idle past the limit before this mount (reload, or
    // the tab was frozen while the person was away), lock straight away.
    if (Date.now() - lastActivity >= ms) {
      doLock();
      return;
    }

    const markActivity = () => {
      lastActivity = Date.now();
      try {
        localStorage.setItem(activityKey, String(lastActivity));
      } catch {}
    };
    markActivity();

    const check = () => {
      // Re-read so activity in another tab of the same session counts too.
      const stored = readLast();
      if (stored > lastActivity) lastActivity = stored;
      if (Date.now() - lastActivity >= ms) doLock();
    };

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, markActivity, { passive: true }));
    const onVisible = () => check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    // Poll (wall-clock based, so throttling only delays detection slightly) and
    // keep a timeout as the precise trigger for a foreground tab.
    const interval = window.setInterval(check, 5_000);
    timerRef.current = window.setTimeout(check, ms + 250);

    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.clearInterval(interval);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, markActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [user?.id, settings?.enabled, settings?.timeout_minutes, locked, doLock]);


  // Manual "Lock screen"
  useEffect(() => {
    const handler = () => doLock();
    window.addEventListener(LOCK_NOW_EVENT, handler);
    return () => window.removeEventListener(LOCK_NOW_EVENT, handler);
  }, [doLock]);

  // Dedicated portal host, kept interactive no matter what else is on screen.
  //
  // Radix overlays (dialog/sheet/dropdown/select) use aria-hidden + `inert` to
  // neutralise every other <body> child while they are open, and leave
  // `pointer-events: none` on <body> plus a scroll-lock attribute. When the
  // inactivity lock appears on top of one of those, the lock card is visible
  // but completely dead to touch/focus — which is exactly what happens in the
  // Android WebView. So we mount into our own node and actively keep the
  // blocking attributes off it (they can be re-applied by Radix's mutation
  // observer at any time).
  const [host, setHost] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof document === "undefined" || !locked) return;

    // Close any open Radix layer first so it stops fighting us.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    const el = document.createElement("div");
    el.setAttribute("data-screen-lock-host", "");
    el.style.position = "relative";
    el.style.zIndex = "2147483000";
    el.style.pointerEvents = "auto";
    document.body.appendChild(el);
    setHost(el);

    const html = document.documentElement;
    const prev = {
      bodyOverflow: document.body.style.overflow,
      bodyPointer: document.body.style.pointerEvents,
      htmlPointer: html.style.pointerEvents,
    };

    const unblock = () => {
      el.removeAttribute("aria-hidden");
      el.removeAttribute("inert");
      el.removeAttribute("data-aria-hidden");
      if (el.style.pointerEvents !== "auto") el.style.pointerEvents = "auto";
      if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "auto";
      if (html.style.pointerEvents === "none") html.style.pointerEvents = "auto";
      // react-remove-scroll leaves this behind and it disables interaction.
      document.body.removeAttribute("data-scroll-locked");
      document.body.style.overflow = "hidden";
    };
    unblock();

    const observer = new MutationObserver(unblock);
    observer.observe(el, { attributes: true, attributeFilter: ["aria-hidden", "inert", "style", "data-aria-hidden"] });
    observer.observe(document.body, { attributes: true, attributeFilter: ["style", "data-scroll-locked"] });
    observer.observe(html, { attributes: true, attributeFilter: ["style"] });
    // Belt and braces for WebView, where the observer can fire late.
    const poll = window.setInterval(unblock, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(poll);
      setHost(null);
      el.remove();
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.pointerEvents = prev.bodyPointer;
      html.style.pointerEvents = prev.htmlPointer;
    };
  }, [locked]);

  if (!user || !locked || !settings || !host) return null;

  return createPortal(
    <ScreenLockOverlay settings={settings} onUnlock={() => doUnlock()} />,
    host,
  );
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

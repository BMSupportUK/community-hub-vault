import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_TIMEOUT_MINUTES,
  STAFF_MAX_TIMEOUT_MINUTES,
} from "@/lib/screen-lock-hash";
import { ScreenLockOverlay } from "@/components/app/ScreenLockOverlay";
import { resumeTalkPresence, suspendTalkPresence } from "@/hooks/use-talk-channel-presence";
import { BmSplash } from "@/components/app/BmSplash";


export interface ScreenLockSettings {
  enabled: boolean;
  timeout_minutes: number;
  code_hash: string | null;
  must_change: boolean;
}

export const LOCK_NOW_EVENT = "app:screen-lock-now";
export const LOCK_STATE_EVENT = "app:screen-lock-state";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;
const RESUME_SPLASH_MS = 3_000;

/** Ask the app to lock immediately (used by the avatar menu). */
export function lockScreenNow() {
  window.dispatchEvent(new Event(LOCK_NOW_EVENT));
}

export function ScreenLockProvider({ children }: { children: ReactNode }) {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const [settings, setSettings] = useState<ScreenLockSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [resumeChecking, setResumeChecking] = useState(false);
  const [locked, setLocked] = useState(() => {
    if (typeof window === "undefined" || !user) return false;
    try {
      return localStorage.getItem(`screenlock:locked:${user.id}`) === "1";
    } catch {
      return false;
    }
  });
  const timerRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const wasBackgroundedRef = useRef(false);
  const storageKey = user ? `screenlock:locked:${user.id}` : null;

  // Safety net: never let a stale overlay leftover kill clicks.
  //
  // Radix layers (dialog/sheet/dropdown/select) mark the rest of the page
  // `inert`/`aria-hidden` and put `pointer-events: none` + `data-scroll-locked`
  // on <body> while they are open. If a layer unmounts at an awkward moment
  // (route change, the lock screen appearing/disappearing over it) those marks
  // can be left behind and the whole UI — including the side rail links —
  // stops responding to clicks. This watchdog clears them whenever no layer is
  // actually open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    const html = document.documentElement;

    const anyLayerOpen = () =>
      !!document.querySelector(
        '[data-radix-popper-content-wrapper],[data-state="open"][role="dialog"],[data-state="open"][role="menu"],[data-screen-lock-host]',
      );

    const sweep = () => {
      if (anyLayerOpen()) return;
      if (body.style.pointerEvents === "none") body.style.removeProperty("pointer-events");
      if (html.style.pointerEvents === "none") html.style.removeProperty("pointer-events");
      if (body.hasAttribute("data-scroll-locked")) body.removeAttribute("data-scroll-locked");
      if (body.style.overflow === "hidden") body.style.removeProperty("overflow");
      Array.from(body.children).forEach((child) => {
        if (child.hasAttribute("inert")) child.removeAttribute("inert");
        if (child.getAttribute("aria-hidden") === "true") {
          child.removeAttribute("aria-hidden");
          child.removeAttribute("data-aria-hidden");
        }
      });
    };

    const observer = new MutationObserver(sweep);
    observer.observe(body, {
      attributes: true,
      attributeFilter: ["style", "data-scroll-locked", "inert", "aria-hidden"],
      childList: true,
      subtree: false,
    });
    observer.observe(html, { attributes: true, attributeFilter: ["style"] });
    const poll = window.setInterval(sweep, 1000);
    return () => {
      observer.disconnect();
      window.clearInterval(poll);
    };
  }, []);


  // Load (or create) this user's lock settings.
  useEffect(() => {
    if (!user) {
      setSettings(null);
      setLocked(false);
      setReady(false);
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
      }
      // Decide the initial lock state before allowing the protected page to
      // render. This covers both a persisted lock and inactivity while the app
      // was closed/backgrounded, without exposing one frame of page content.
      const flagKey = `screenlock:locked:${user.id}`;
      const activityKey = `screenlock:last-activity:${user.id}`;
      let savedLocked = false;
      let idleExpired = false;
      if (typeof window !== "undefined") {
        try {
          savedLocked = localStorage.getItem(flagKey) === "1";
          const lastActivity = Number(localStorage.getItem(activityKey));
          const timeoutMs = Math.max(1, active?.timeout_minutes || DEFAULT_TIMEOUT_MINUTES) * 60_000;
          idleExpired = Number.isFinite(lastActivity) && lastActivity > 0 && Date.now() - lastActivity >= timeoutMs;
        } catch {}
      }
      const shouldLock = Boolean(active?.enabled && (savedLocked || idleExpired));
      setLocked(shouldLock);
      window.dispatchEvent(new CustomEvent(LOCK_STATE_EVENT, { detail: { locked: shouldLock } }));
      setSettings(active);
      setReady(true);
      if (shouldLock) {
        try {
          localStorage.setItem(flagKey, "1");
        } catch {}
        void suspendTalkPresence(user.id);
      } else if (!active?.enabled) {
        try {
          localStorage.removeItem(flagKey);
        } catch {}
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
      window.dispatchEvent(new CustomEvent(LOCK_STATE_EVENT, { detail: { locked: true } }));
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
      window.dispatchEvent(new CustomEvent(LOCK_STATE_EVENT, { detail: { locked: false } }));
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

  // Hide the page as soon as the app leaves the foreground. On return, decide
  // whether inactivity requires the lock, then keep the branded splash visible
  // long enough for the resumed app to settle before revealing protected UI.
  useEffect(() => {
    if (!user || !ready) return;
    const clearResumeTimer = () => {
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
    };
    const hide = () => {
      wasBackgroundedRef.current = true;
      clearResumeTimer();
      setResumeChecking(true);
    };
    const checkResume = () => {
      if (document.visibilityState !== "visible") {
        // Only hide content while backgrounded when a lock check may be needed
        // on return; otherwise there is nothing to protect and no reason to
        // flash the loading screen.
        if (settings?.enabled && !locked) hide();
        return;
      }
      if (!wasBackgroundedRef.current) return;

      wasBackgroundedRef.current = false;
      clearResumeTimer();

      // The splash only stays up if the inactivity check could actually lock
      // the app — i.e. the lock feature is on and the screen isn't already
      // locked. When it isn't needed, reveal the protected area immediately.
      if (settings?.enabled && !locked) {
        setResumeChecking(true);
        let expired = false;
        try {
          const lastActivity = Number(localStorage.getItem(`screenlock:last-activity:${user.id}`));
          const timeoutMs = Math.max(1, settings.timeout_minutes || DEFAULT_TIMEOUT_MINUTES) * 60_000;
          expired = Number.isFinite(lastActivity) && lastActivity > 0 && Date.now() - lastActivity >= timeoutMs;
        } catch {}
        if (expired) {
          doLock();
          // Lock screen takes over instantly — no need for the splash hold.
          setResumeChecking(false);
          return;
        }
        resumeTimerRef.current = window.setTimeout(() => {
          resumeTimerRef.current = null;
          setResumeChecking(false);
        }, RESUME_SPLASH_MS);
      } else {
        setResumeChecking(false);
      }
    };
    document.addEventListener("visibilitychange", checkResume);
    window.addEventListener("pageshow", checkResume);
    window.addEventListener("pagehide", hide);
    return () => {
      clearResumeTimer();
      document.removeEventListener("visibilitychange", checkResume);
      window.removeEventListener("pageshow", checkResume);
      window.removeEventListener("pagehide", hide);
    };
  }, [user?.id, ready, settings?.enabled, settings?.timeout_minutes, locked, doLock]);



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

  // The provider replaces the entire signed-in shell while locked, so the lock
  // screen can render directly. Keeping it in the React tree avoids a portal
  // host being detached during WebView resume, which cleared the entered code
  // and left the Unlock button disabled.
  useEffect(() => {
    if (typeof document === "undefined" || !locked) return;

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const html = document.documentElement;
    const prev = {
      bodyOverflow: document.body.style.overflow,
      bodyPointer: document.body.style.pointerEvents,
      htmlPointer: html.style.pointerEvents,
    };

    const unblock = () => {
      if (document.body.style.pointerEvents === "none") document.body.style.pointerEvents = "auto";
      if (html.style.pointerEvents === "none") html.style.pointerEvents = "auto";
      document.body.removeAttribute("data-scroll-locked");
      document.body.style.overflow = "hidden";
      Array.from(document.body.children).forEach((child) => {
        if (child.hasAttribute("inert")) child.removeAttribute("inert");
        if (child.getAttribute("aria-hidden") === "true") {
          child.removeAttribute("aria-hidden");
          child.removeAttribute("data-aria-hidden");
        }
      });
    };
    unblock();

    return () => {
      document.body.style.overflow = prev.bodyOverflow;
      document.body.style.pointerEvents = prev.bodyPointer;
      html.style.pointerEvents = prev.htmlPointer;
    };
  }, [locked]);

  // A known-locked screen goes straight to the lock screen: no reason to make
  // someone stare at the loading screen before they can type their code.
  if (user && ready && settings && locked) {
    return <ScreenLockOverlay settings={settings} onUnlock={() => doUnlock()} />;
  }
  if (!user || !ready || !settings || resumeChecking) return <BmSplash />;
  return <>{children}</>;
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

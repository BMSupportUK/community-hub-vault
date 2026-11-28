import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DEFAULT_TIMEOUT_MINUTES,
  STAFF_MAX_TIMEOUT_MINUTES,
  shouldLockScreen,
} from "@/lib/screen-lock-hash";
import { ScreenLockOverlay } from "@/components/app/ScreenLockOverlay";
import { resumeTalkPresence, suspendTalkPresence } from "@/hooks/use-talk-channel-presence";
import { BmSplash } from "@/components/app/BmSplash";
import { ScreenLockKeepAliveContext } from "@/components/app/ScreenLockKeepAlive";
import { useServerFn } from "@tanstack/react-start";
import { getScreenLockAdminAccess } from "@/lib/screen-lock-admin.functions";
import { screenAccess } from "@/lib/application-access.functions";
import { screenLockAdminBypass } from "@/lib/screen-lock-admin";


export interface ScreenLockSettings {
  enabled: boolean;
  timeout_minutes: number;
}

export const LOCK_NOW_EVENT = "app:screen-lock-now";
export const LOCK_STATE_EVENT = "app:screen-lock-state";
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"] as const;


/** Ask the app to lock immediately (used by the avatar menu). */
export function lockScreenNow() {
  window.dispatchEvent(new Event(LOCK_NOW_EVENT));
}

export function ScreenLockProvider({ children, lockedExtras }: { children: ReactNode; lockedExtras?: ReactNode }) {
  const { user } = useAuth();
  const verify = useServerFn(getScreenLockAdminAccess);
  const [checked, setChecked] = useState<string | null>(null);
  const [grant, setGrant] = useState<{ userId: string; expiresAt: string | null } | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!user) { setChecked(null); setGrant(null); return; }
    let active = true;
    const refresh = async () => {
      try { const result = await verify(); if (active) setGrant(result); }
      catch { if (active) setGrant(null); }
      finally { if (active) setChecked(user.id); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener("bm-customer-switch-status", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("bm-customer-switch-status", refresh); };
  }, [user?.id, verify]);
  useEffect(() => {
    if (!grant?.expiresAt) return;
    const timer = window.setTimeout(() => tick(n => n + 1), Math.max(0, Date.parse(grant.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [grant]);
  if (user && checked !== user.id) return <BmSplash />;
  // Do not mount lock settings, idle writes or cross-tab unlock broadcasts for a switched admin.
  if (user && screenLockAdminBypass(grant, user.id)) return <>{children}</>;
  return <NormalScreenLockProvider key={user?.id} lockedExtras={lockedExtras}>{children}</NormalScreenLockProvider>;
}

function NormalScreenLockProvider({ children, lockedExtras }: { children: ReactNode; lockedExtras?: ReactNode }) {
  const { user, hasAny } = useAuth();
  const verifyScreen = useServerFn(screenAccess);
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const [settings, setSettings] = useState<ScreenLockSettings | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [liveConnections, setLiveConnections] = useState(0);
  const generation = useRef(0);
  const registerLiveConnection = useCallback(() => {
    setLiveConnections(count => count + 1);
    return () => setLiveConnections(count => Math.max(0, count - 1));
  }, []);
  const refresh = useCallback(async (activity = false) => {
    const request = generation.current;
    try {
      const result = await verifyScreen({ data: { activity, lock: false } });
      if (request !== generation.current) return false;
      setSettings({ enabled: result.enabled, timeout_minutes: result.timeout_minutes });
      setLocked(!result.open);
      window.dispatchEvent(new CustomEvent(LOCK_STATE_EVENT, { detail: { locked: !result.open } }));
      return result.open;
    } catch {
      // A failed check (offline, token refreshing) keeps the current state; only a real server answer locks.
      return false;
    }
  }, [verifyScreen]);

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
        if (child.hasAttribute("data-screen-lock-content")) return;
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


  useEffect(() => {
    let active = true;
    if (!user) { setReady(true); setLocked(false); return; }
    setReady(false);
    void (async () => {
      const { data, error } = await supabase.from("screen_lock_settings").select("enabled,timeout_minutes").eq("user_id", user.id).maybeSingle();
      if (!active) return;
      if (!error && !data) {
        await supabase.from("screen_lock_settings").insert({ user_id: user.id, enabled: true, timeout_minutes: isStaff ? STAFF_MAX_TIMEOUT_MINUTES : DEFAULT_TIMEOUT_MINUTES });
      }
      await refresh();
      if (active) setReady(true);
    })();
    return () => { active = false; generation.current += 1; };
  }, [user?.id, isStaff, refresh]);

  const doLock = useCallback(() => {
    generation.current += 1;
    setLocked(true);
    window.dispatchEvent(new CustomEvent(LOCK_STATE_EVENT, { detail: { locked: true } }));
    if (user) void suspendTalkPresence(user.id);
    void verifyScreen({ data: { activity: false, lock: true } }).catch(() => {});
    window.dispatchEvent(new Event("bm-access-change"));
  }, [user?.id, verifyScreen]);
  const doUnlock = useCallback(async () => {
    // A callback, storage write or broadcast is not proof of password verification.
    if (await refresh()) {
      resumeTalkPresence();
      window.dispatchEvent(new Event("bm-access-change"));
    }
  }, [refresh]);

  useEffect(() => {
    if (!user || !ready) return;
    let inFlight = false;
    let activity = false;
    let lastActivity = Date.now();
    const mark = (event: Event) => { if (event.isTrusted && !locked) { activity = true; lastActivity = Date.now(); } };
    const poll = async () => {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      const touched = activity;
      activity = false;
      await refresh(touched);
      inFlight = false;
    };
    const check = () => {
      if (!locked && settings && shouldLockScreen(settings.enabled, false, lastActivity, settings.timeout_minutes)) doLock();
      void poll();
    };
    const visible = () => {
      if (document.visibilityState !== "visible") return;
      // A short app switch is not a cold start. Keep the page visible while
      // rechecking server access, but conceal it immediately if idle time expired.
      check();
    };
    const timer = window.setInterval(check, 5_000);
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, mark, { passive: true }));
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, mark));
      window.removeEventListener("focus", visible); window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user?.id, ready, locked, settings?.enabled, settings?.timeout_minutes, refresh, doLock]);

  useEffect(() => {
    if (!user) return;
    const handler = () => doLock();
    window.addEventListener(LOCK_NOW_EVENT, handler);
    const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(`screenlock-${user.id}`);
    if (channel) channel.onmessage = () => { void refresh(); };
    // Broadcasts request an authoritative recheck; they never unlock anything.
    const settingsChannel = supabase.channel(`screen-lock-settings-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "screen_lock_settings", filter: `user_id=eq.${user.id}` }, () => { void refresh(); }).subscribe();
    return () => { window.removeEventListener(LOCK_NOW_EVENT, handler); channel?.close(); void supabase.removeChannel(settingsChannel); };
  }, [user?.id, doLock, refresh]);

  useEffect(() => {
    if (!locked) return;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    const body = document.body;
    const html = document.documentElement;
    const previous = { overflow: body.style.overflow, pointer: body.style.pointerEvents, htmlPointer: html.style.pointerEvents };
    body.style.pointerEvents = "auto"; html.style.pointerEvents = "auto";
    body.removeAttribute("data-scroll-locked"); body.style.overflow = "hidden";
    return () => { body.style.overflow = previous.overflow; body.style.pointerEvents = previous.pointer; html.style.pointerEvents = previous.htmlPointer; };
  }, [locked]);

  if (user && !ready) return <BmSplash />;
  const showLock = Boolean(user && ready && locked);
  const keepConnection = liveConnections > 0;
  return (
    <ScreenLockKeepAliveContext.Provider value={registerLiveConnection}>
      {/* Keep transport peers stable; fresh protected reads remain blocked on the server. */}
      <div data-screen-lock-content className={showLock ? "hidden" : "contents"} hidden={showLock} inert={showLock} aria-hidden={showLock ? true : undefined}>
        {(!showLock || keepConnection) && children}
      </div>
      {showLock && <ScreenLockOverlay onUnlock={() => { void doUnlock(); }} />}
      {showLock && <div data-screen-lock-alerts>{!keepConnection && lockedExtras}</div>}
    </ScreenLockKeepAliveContext.Provider>
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

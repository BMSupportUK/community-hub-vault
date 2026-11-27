import { useEffect, useState, useSyncExternalStore } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getApplicationAccess } from "./application-access.functions";
import type { ApplicationAccess } from "./application-access-policy";

export const ADMIN_UNLOCK_KEY = (uid: string) => `admin_unlock_until:${uid}`;
export const ADMIN_UNLOCK_TTL_MS = 60 * 60_000;
const closed: ApplicationAccess = { screen: false, dashboard: false, portal: false, dashboardUntil: null, portalUntil: null };
let snapshot = { userId: "", access: closed };
const listeners = new Set<() => void>();
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
function publish(userId: string, access: ApplicationAccess) { snapshot = { userId, access }; listeners.forEach(fn => fn()); }
export function isAdminUnlocked(userId: string | undefined | null) {
  return !!userId && snapshot.userId === userId && snapshot.access.dashboard && !!snapshot.access.dashboardUntil && Date.parse(snapshot.access.dashboardUntil) > Date.now();
}
export function useApplicationAccess(userId: string | undefined) {
  const get = useServerFn(getApplicationAccess);
  const state = useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  useEffect(() => {
    if (!userId) { publish("", closed); return; }
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running) return;
      running = true;
      try { const access = await get(); if (active) publish(userId, access); }
      catch { if (active) publish(userId, closed); }
      finally { running = false; }
    };
    if (snapshot.userId !== userId) publish(userId, closed);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    window.addEventListener("bm-access-change", refresh);
    window.addEventListener("bm-portal-lock-change", refresh);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("bm-access-change", refresh); window.removeEventListener("bm-portal-lock-change", refresh); window.removeEventListener("focus", refresh); };
  }, [userId, get]);
  if (state.userId !== userId) return closed;
  const access = state.access;
  return {
    ...access,
    dashboard: access.dashboard && !!access.dashboardUntil && Date.parse(access.dashboardUntil) > now,
    portal: access.portal && (!access.portalUntil || Date.parse(access.portalUntil) > now),
  };
}

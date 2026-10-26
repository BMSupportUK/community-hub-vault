import { useCallback, useEffect, useRef, useState } from "react";
import { RenewalRequestGate } from "@/lib/enabler-renewal";

/** A scoped UI lock, not an authorization grant. Survives switching setup tabs. */
export function useEnablerRenewalGate(scope: string, pendingSession: string | null) {
  const gate = useRef(new RenewalRequestGate());
  const [waiting, setWaiting] = useState(false);
  const key = `bm-enabler-wait:${scope}`;
  const publish = useCallback(() => {
    setWaiting(gate.current.waiting());
    try {
      if (gate.current.waiting()) sessionStorage.setItem(key, JSON.stringify({ expiresAt: gate.current.expiresAt, previousSession: gate.current.previousSession }));
      else sessionStorage.removeItem(key);
    } catch { /* Storage unavailable: the in-memory lock still prevents repeats. */ }
  }, [key]);
  useEffect(() => {
    gate.current.reset();
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (saved && Number.isFinite(saved.expiresAt)) {
        gate.current.expiresAt = saved.expiresAt;
        gate.current.previousSession = typeof saved.previousSession === "string" ? saved.previousSession : null;
      }
    } catch { /* Ignore malformed UI state. */ }
    publish();
  }, [key, publish]);
  useEffect(() => {
    const sync = () => { gate.current.sync(pendingSession); publish(); };
    sync();
    const timer = window.setInterval(sync, 1000);
    return () => window.clearInterval(timer);
  }, [pendingSession, publish]);
  const begin = useCallback(() => {
    const accepted = gate.current.begin(pendingSession);
    publish();
    return accepted;
  }, [pendingSession, publish]);
  const finish = useCallback((state: string) => { gate.current.finish(state); publish(); }, [publish]);
  const reset = useCallback(() => { gate.current.reset(); publish(); }, [publish]);
  return { waiting, begin, finish, reset };
}
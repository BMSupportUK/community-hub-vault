import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { checkMyVpnOnLogin } from "@/lib/vpn-login-check.functions";
import { refreshVpnUserSet } from "@/lib/vpn-flags";

async function getClientIpHint(): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch("https://api.ipify.org?format=json", {
      cache: "no-store",
      signal: ctrl.signal,
    });
    window.clearTimeout(t);
    if (!res.ok) return null;
    const json = (await res.json()) as { ip?: unknown };
    return typeof json.ip === "string" ? json.ip : null;
  } catch {
    return null;
  }
}

export type AppRole =
  | "admin"
  | "management"
  | "staff"
  | "moderator"
  | "subscriber"
  | "nonsubscriber"
  | "member"
  | "pending"
  | "banned"
  | "rejected";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (r: AppRole) => boolean;
  hasAny: (rs: AppRole[]) => boolean;
  isPending: boolean;
  isStaff: boolean;
  isMod: boolean;
  isBanned: boolean;
  isRejected: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const loadRoles = async (uid: string) => {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    // If the query fails (transient network / RLS hiccup), keep the previously
    // loaded roles intact. Otherwise a refresh would clear roles, flip
    // `isPending` to true, and bounce admin/staff to /gate — i.e. an effective
    // logout on reload. Only mark rolesLoaded once we have a real answer.
    if (error) {
      console.warn("[auth] loadRoles failed, keeping previous roles", error);
      // Retry shortly so we don't sit on a Loading… screen for 30s on first load.
      setTimeout(() => {
        loadRoles(uid);
      }, 2000);
      return;
    }
    setRoles((data ?? []).map((r) => r.role as AppRole));
    setRolesLoaded(true);
  };

  const runVpnLoginCheck = (uid: string, minIntervalMs = 60_000) => {
    try {
      const checkedKey = `vpn-checked:v3:${uid}`;
      const checkingKey = `vpn-checking:${uid}`;
      const lastChecked = Number(sessionStorage.getItem(checkedKey) ?? "0");
      if (
        typeof window === "undefined" ||
        Date.now() - lastChecked < minIntervalMs ||
        sessionStorage.getItem(checkingKey)
      ) {
        return;
      }
      sessionStorage.setItem(checkingKey, "1");
      setTimeout(() => {
        getClientIpHint()
          .then((clientIpHint) => checkMyVpnOnLogin({ data: { clientIpHint } }))
          .then(() => {
            sessionStorage.setItem(checkedKey, String(Date.now()));
            refreshVpnUserSet();
          })
          .catch((e) => console.warn("[auth] vpn check failed", e))
          .finally(() => sessionStorage.removeItem(checkingKey));
      }, 0);
    } catch {
      checkMyVpnOnLogin({ data: {} })
        .then(() => refreshVpnUserSet())
        .catch((e) => console.warn("[auth] vpn check failed", e));
    }
  };

  useEffect(() => {
    let currentUid: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      const nextUid = s?.user?.id ?? null;
      if (nextUid && nextUid !== currentUid) {
        currentUid = nextUid;
        setRolesLoaded(false);
        setTimeout(() => loadRoles(nextUid), 0);
      } else if (!nextUid) {
        currentUid = null;
        setRoles([]);
        setRolesLoaded(true);
      }
      if (event === "SIGNED_IN" && nextUid) {
        runVpnLoginCheck(nextUid);
      }
      // Same user (e.g. TOKEN_REFRESHED on tab refocus): do not reload roles —
      // toggling rolesLoaded would flip the global loading state and unmount the app.
    });
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        currentUid = s.user.id;
        await loadRoles(s.user.id);
        runVpnLoginCheck(s.user.id);
      } else {
        setRolesLoaded(true);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Refresh roles without a full page reload:
  // - poll every 30s while signed in
  // - re-check on tab focus / visibility change
  // (user_roles is no longer broadcast via Realtime for security reasons.)
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const tick = () => {
      loadRoles(uid);
    };
    const interval = window.setInterval(tick, 30_000);
    const onFocus = () => tick();
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    // On focus/visibility (user-driven), re-check almost immediately (5s throttle)
    // so toggling a VPN and switching back to the tab updates the shield right away.
    const onVpnRefresh = () => runVpnLoginCheck(uid, 5_000);
    // Poll VPN status every 20s while signed in so connecting a VPN mid-session is detected live.
    const vpnInterval = window.setInterval(() => runVpnLoginCheck(uid, 20_000), 20_000);
    window.addEventListener("focus", onVpnRefresh);
    document.addEventListener("visibilitychange", onVpnRefresh);
    return () => {
      window.clearInterval(interval);
      window.clearInterval(vpnInterval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVpnRefresh);
      document.removeEventListener("visibilitychange", onVpnRefresh);
    };
  }, [user?.id]);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAny = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  // While roles are still loading we should NOT treat the user as pending —
  // otherwise approved users get bounced to /gate on login/reload.
  const isPending =
    rolesLoaded && (roles.length === 0 || (roles.length === 1 && roles[0] === "pending"));
  const isBanned = roles.includes("banned");
  const isRejected = roles.includes("rejected");
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const isMod = hasAny(["admin", "management", "moderator"]);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        roles,
        loading: loading || (!!user && !rolesLoaded),
        hasRole,
        hasAny,
        isPending,
        isStaff,
        isMod,
        isBanned,
        isRejected,
        signOut: async () => {
          await supabase.auth.signOut();
        },
        refreshRoles: async () => {
          if (user) await loadRoles(user.id);
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

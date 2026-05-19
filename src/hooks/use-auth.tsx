import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "management" | "staff" | "moderator" | "subscriber" | "nonsubscriber" | "member" | "pending" | "banned" | "rejected";

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
      setTimeout(() => { loadRoles(uid); }, 2000);
      return;
    }
    setRoles((data ?? []).map((r) => r.role as AppRole));
    setRolesLoaded(true);
  };

  useEffect(() => {
    let currentUid: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
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
      // Same user (e.g. TOKEN_REFRESHED on tab refocus): do not reload roles —
      // toggling rolesLoaded would flip the global loading state and unmount the app.
    });
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        currentUid = s.user.id;
        await loadRoles(s.user.id);
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
    const tick = () => { loadRoles(uid); };
    const interval = window.setInterval(tick, 30_000);
    const onFocus = () => tick();
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [user?.id]);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAny = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  // While roles are still loading we should NOT treat the user as pending —
  // otherwise approved users get bounced to /gate on login/reload.
  const isPending = rolesLoaded && (roles.length === 0 || (roles.length === 1 && roles[0] === "pending"));
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

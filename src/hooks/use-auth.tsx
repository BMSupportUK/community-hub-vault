import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "management" | "staff" | "moderator" | "subscriber" | "member" | "pending" | "banned";

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
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
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

  // Realtime: refresh roles when this user's user_roles rows change
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`user-roles-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${user.id}` },
        () => { loadRoles(user.id); },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAny = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  // While roles are still loading we should NOT treat the user as pending —
  // otherwise approved users get bounced to /gate on login/reload.
  const isPending = rolesLoaded && (roles.length === 0 || (roles.length === 1 && roles[0] === "pending"));
  const isBanned = roles.includes("banned");
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

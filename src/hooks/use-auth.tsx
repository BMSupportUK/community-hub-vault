import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "management" | "staff" | "moderator" | "member" | "pending";

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
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(async ({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) await loadRoles(s.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const hasRole = (r: AppRole) => roles.includes(r);
  const hasAny = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const isPending = roles.length === 0 || (roles.length === 1 && roles[0] === "pending");
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const isMod = hasAny(["admin", "management", "moderator"]);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        roles,
        loading,
        hasRole,
        hasAny,
        isPending,
        isStaff,
        isMod,
        signOut: async () => {
          await supabase.auth.signOut();
        },
        refreshRoles: async () => user && loadRoles(user.id),
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

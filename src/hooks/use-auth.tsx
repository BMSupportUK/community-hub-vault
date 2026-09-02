import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { checkMyVpnOnLogin } from "@/lib/vpn-login-check.functions";
import { sendShiftEventPush, sendBreakEventPush } from "@/lib/push.functions";
import { isFanZoneOnlyRoles } from "@/lib/fan-zone-nav";
import { sortRolesByPriority } from "@/lib/role-rank";
import { leaveTalkChannelsOnSignOut } from "@/hooks/use-talk-channel-presence";

export type AppRole =
  | "admin"
  | "management"
  | "staff"
  | "moderator"
  | "boro_fan_zone_moderator"
  | "boro_fan_zone_member"
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
  /** Account signed up for the Boro Fan Zone only — no BM Support access. */
  isFanZoneOnly: boolean;
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
  const activeUidRef = useRef<string | null>(null);

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
    // A role request may finish after sign-out. Never let that stale response
    // restore an authenticated role state for a user whose session is gone.
    if (activeUidRef.current !== uid) return;
    // The database does not guarantee row order. Keep BM Support roles first
    // so dual-role accounts are consistently represented by their highest
    // support role throughout the UI.
    setRoles(sortRolesByPriority((data ?? []).map((r) => r.role as AppRole)));
    setRolesLoaded(true);
  };

  useEffect(() => {
    let currentUid: string | null = null;
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      const nextUid = s?.user?.id ?? null;
      activeUidRef.current = nextUid;
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
        activeUidRef.current = s.user.id;
        await loadRoles(s.user.id);
      } else {
        activeUidRef.current = null;
        setRolesLoaded(true);
      }
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Keep the signed-in user's role set fresh: Realtime on user_roles gives an
  // instant update when an admin (or the subscription sync) grants/removes a
  // role, with a polling + focus fallback in case the socket drops.
  useEffect(() => {
    if (!user?.id) return;
    const uid = user.id;
    const REFRESH_INTERVAL_MS = 15_000;
    const refresh = () => {
      if (document.visibilityState === "visible") void loadRoles(uid);
    };
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    const onFocus = () => void loadRoles(uid);
    const onVis = () => {
      if (document.visibilityState === "visible") void loadRoles(uid);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const channel = supabase
      .channel(`user-roles-${uid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${uid}` },
        () => {
          void loadRoles(uid);
        },
      )
      .subscribe();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);


  // Re-check the signed-in user's VPN/proxy status periodically so the
  // `signup_info` row reflects their *current* network state — not just the
  // state captured at login. Without this, toggling a VPN off mid-session
  // never updates the badge for admins/staff viewing the user. Throttled to
  // avoid hammering the upstream IP intel APIs.
  useEffect(() => {
    if (!user?.id) return;
    let lastRun = 0;
    const MIN_INTERVAL_MS = 60_000;
    const recheck = () => {
      const now = Date.now();
      if (now - lastRun < MIN_INTERVAL_MS) return;
      lastRun = now;
      void checkMyVpnOnLogin({ data: {} }).catch((err) => {
        console.warn("[auth] VPN recheck failed", err);
      });
    };
    recheck();
    const interval = window.setInterval(recheck, 2 * 60_000);
    const onFocus = () => recheck();
    const onVis = () => {
      if (document.visibilityState === "visible") recheck();
    };
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
  const isPending =
    !!user && rolesLoaded && (roles.length === 0 || (roles.length === 1 && roles[0] === "pending"));
  const isBanned = roles.includes("banned");
  const isRejected = roles.includes("rejected");
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const isMod = hasAny(["admin", "management", "moderator"]);
  const isFanZoneOnly = rolesLoaded && isFanZoneOnlyRoles(roles);

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
        isFanZoneOnly,
        signOut: async () => {
          const signingOutUser = user;
          // Invalidate any in-flight role lookup immediately. Without this, a
          // late response can briefly restore the old user's route state.
          activeUidRef.current = null;
          // Tell every Talk client this connection has left before the account
          // session is revoked. Route cleanup alone can miss a fast hard
          // redirect and leave the visible member number stale.
          if (signingOutUser) {
            await Promise.race([
              leaveTalkChannelsOnSignOut(signingOutUser.id),
              new Promise((resolve) => window.setTimeout(resolve, 750)),
            ]);
          }
          // Auto-clock-out any active shift (and end any active break) so the
          // staff member doesn't stay "on shift" after leaving. This is
          // best-effort only: it must never be able to block or delay the
          // actual sign out (a slow/failing query used to leave the user
          // stuck signed in).
          const autoClockOut = async () => {
            if (!signingOutUser) return;
            const { data: shift } = await supabase
              .from("shifts")
              .select("id")
              .eq("user_id", signingOutUser.id)
              .is("clock_out", null)
              .order("clock_in", { ascending: true })
              .limit(1)
              .maybeSingle();
            if (!shift?.id) return;
            const { data: brk } = await supabase
              .from("breaks")
              .select("id,kind")
              .eq("shift_id", shift.id)
              .is("ended_at", null)
              .maybeSingle();
            if (brk?.id) {
              await supabase
                .from("breaks")
                .update({ ended_at: new Date().toISOString() })
                .eq("id", brk.id);
              sendBreakEventPush({ data: { kind: "end", breakKind: brk.kind as "break" | "lunch" } }).catch(() => {});
            }
            await supabase
              .from("shifts")
              .update({ clock_out: new Date().toISOString() })
              .eq("id", shift.id);
            sendShiftEventPush({ data: { kind: "clock_out" } }).catch(() => {});
          };

          await Promise.race([
            autoClockOut().catch((err) => {
              console.warn("[auth] auto clock-out on sign out failed", err);
            }),
            new Promise((resolve) => window.setTimeout(resolve, 2500)),
          ]);

          // Clear the session locally first so the UI can never stay signed in,
          // even if the network call to revoke the token is slow or fails.
          try {
            await Promise.race([
              supabase.auth.signOut(),
              new Promise((resolve) => window.setTimeout(resolve, 4000)),
            ]);
          } catch (err) {
            console.warn("[auth] signOut request failed, clearing locally", err);
          }
          try {
            await supabase.auth.signOut({ scope: "local" });
          } catch {
            /* already cleared */
          }
          try {
            Object.keys(window.localStorage)
              .filter((k) => k.startsWith("sb-") && k.includes("auth-token"))
              .forEach((k) => window.localStorage.removeItem(k));
          } catch {
            /* storage unavailable */
          }
          setSession(null);
          setUser(null);
          setRoles([]);
          setRolesLoaded(true);
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

/** Auth context when available, otherwise null (safe on guest-only trees). */
export function useOptionalAuth() {
  return useContext(Ctx);
}

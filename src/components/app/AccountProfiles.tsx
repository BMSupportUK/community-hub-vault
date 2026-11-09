import { useCallback, useEffect, useState } from "react";
import { Hash, UserRound, UsersRound, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { selectAccountProfile, restoreStaffProfile } from "@/lib/profile-access.functions";
import {
  ACTIVE_PROFILE_EVENT,
  type AccountProfile,
  needsProfileChoice,
  pickActiveProfile,
  profileUsesStaffPortal,
  readActiveProfileId,
  requestProfileChooser,
  saveActiveProfile,
  wasProfileChosen,
} from "@/lib/account-profiles";

/** The signed-in customer's login profiles and the one currently selected. */
export function useAccountProfiles() {
  const { user, profileAccess } = useAuth();
  const userId = user?.id ?? null;
  const [profiles, setProfiles] = useState<AccountProfile[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [chosen, setChosen] = useState(true);

  useEffect(() => {
    if (!userId) { setProfiles([]); setLoaded(true); return; }
    let active = true;
    const load = async () => {
      const [{ data: creds }, { data: nums }] = await Promise.all([
        supabase
          .from("app_credentials")
          .select("id, account_number, account_type, app_login_name, expiry_at")
          .eq("owner_id", userId)
          .order("account_number", { ascending: true }),
        supabase.rpc("login_player_numbers", { _owner: userId }),
      ]);
      if (!active) return;
      const numRows = (nums ?? []) as { credential_id: string; number: number | null }[];
      setProfiles(
        ((creds ?? []) as { id: string; account_number: number; account_type: string | null; app_login_name: string | null; expiry_at: string | null }[]).map((c) => ({
          id: c.id,
          login: c.app_login_name,
          accountNumber: c.account_number,
          accountType: c.account_type,
          expiryAt: c.expiry_at,
          playerNumber: numRows.find((r) => r.credential_id === c.id)?.number ?? null,
        })),
      );
      setLoaded(true);
    };
    load();
    const sync = () => { setSavedId(readActiveProfileId(userId)); setChosen(wasProfileChosen(userId)); };
    sync();
    const channel = supabase
      .channel(`account-profiles-${userId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "credential_change_events", filter: `owner_id=eq.${userId}` }, () => load())
      .subscribe();
    window.addEventListener(ACTIVE_PROFILE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener(ACTIVE_PROFILE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [userId]);

  const select = useCallback((id: string) => { if (userId) saveActiveProfile(userId, id); }, [userId]);
  const activeProfile = pickActiveProfile(profiles, profileAccess?.profileId ?? savedId);
  return { userId, profiles, loaded, activeProfile, select, chooserOpen: loaded && needsProfileChoice(profiles.length, chosen) };
}

export const accountTypeLabel = (type: string | null) => {
  const t = (type ?? "single").toLowerCase();
  if (t === "multi") return "Multi-room";
  if (t === "triple") return "Triple-room";
  return "Single";
};

/** Header pill: reopen the profile chooser. Only shown when the customer has 2+ logins. */
export function SwitchProfilePill() {
  const { userId, profiles, loaded } = useAccountProfiles();
  if (!userId || !loaded || profiles.length < 2) return null;
  return (
    <button
      type="button"
      onClick={() => requestProfileChooser(userId)}
      title="Switch profile"
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 bg-violet-500/15 border border-violet-500/40 text-violet-300 text-[11px] font-semibold hover:bg-violet-500/25 transition-colors"
    >
      <UsersRound className="size-3.5" />
      <span className="hidden xl:inline">Switch profile</span>
    </button>
  );
}

/** Full-screen "Choose your profile" screen for customers with more than one login. */
export function ProfileChooser() {
  const { profiles, activeProfile, select, chooserOpen } = useAccountProfiles();
  const { roles, profileAccess, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const switchProfile = useServerFn(selectAccountProfile);
  const restoreStaff = useServerFn(restoreStaffProfile);
  const queryClient = useQueryClient();
  const [passwordProfile, setPasswordProfile] = useState<AccountProfile | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const commit = async (p: AccountProfile, restore = false) => {
    setBusy(true); setError("");
    try {
      await queryClient.cancelQueries();
      if (restore) await restoreStaff({ data: { profileId: p.id, password } });
      else await switchProfile({ data: { profileId: p.id } });
      queryClient.clear();
      select(p.id);
      await refreshRoles();
      setPassword(""); setPasswordProfile(null);
      void navigate({ to: p.accountNumber === 1 && profileAccess?.canUseStaff ? "/staff-portal" : "/portal", replace: true });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to switch profile."); }
    finally { setBusy(false); }
  };
  if (!chooserOpen) return null;
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="profile-chooser-title" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-md">
      <div className="w-full max-w-3xl py-8 text-center">
        <h2 id="profile-chooser-title" className="font-display text-3xl font-bold md:text-4xl">Choose your profile</h2>
        <p className="mt-2 text-muted-foreground">You have {profiles.length} accounts. Pick one to see its details and account number.</p>
        {error && <p role="alert" className="mt-3 text-destructive">{error}</p>}
        {passwordProfile && (
          <form className="mx-auto mt-6 flex max-w-sm flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void commit(passwordProfile, true); }}>
            <label htmlFor="staff-profile-password" className="font-semibold">Account password</label>
            <Input id="staff-profile-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus disabled={busy} />
            <Button type="submit" disabled={busy || !password}>Return to staff profile</Button>
            <Button variant="outline" type="button" disabled={busy} onClick={() => { setPasswordProfile(null); setPassword(""); setError(""); }}>Cancel</Button>
          </form>
        )}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          {profiles.map((p, i) => {
            const current = activeProfile?.id === p.id;
            return (
              <Button
                key={p.id}
                type="button"
                variant="ghost"
                disabled={busy || !!passwordProfile}
                onClick={() => {
                  if (profileAccess?.restricted && profileAccess.canUseStaff && p.accountNumber === 1) { setPasswordProfile(p); setError(""); }
                  else void commit(p);
                }}
                className={cn(
                  "group flex h-auto flex-col items-center gap-3 rounded-2xl border-2 bg-surface p-5 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/50",
                  current ? "border-primary" : "border-border hover:border-primary/60",
                )}
              >
                <span className={cn("relative flex size-20 items-center justify-center rounded-2xl text-primary-foreground", i % 3 === 0 ? "bg-primary" : i % 3 === 1 ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground")}>
                  <UserRound className="size-10" aria-hidden="true" />
                  {current && <Check className="absolute -right-2 -top-2 size-6 rounded-full bg-background p-1 text-primary" aria-label="Current profile" />}
                </span>
                <span className="w-full truncate font-semibold">{p.login || `Account ${p.accountNumber}`}</span>
                <span className="text-xs text-muted-foreground">Account {p.accountNumber} · {accountTypeLabel(p.accountType)}</span>
                {p.playerNumber && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-sm font-semibold text-primary">
                    <Hash className="size-3.5" aria-hidden="true" />{p.playerNumber}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Separate from auth: presentation may hide staff tools, never grant privileges. */
export function useProfilePortal() {
  const auth = useAuth();
  const { activeProfile, loaded } = useAccountProfiles();
  const staff = profileUsesStaffPortal(auth.roles, activeProfile);
  return { staff, loading: auth.loading || !loaded, activeProfile };
}

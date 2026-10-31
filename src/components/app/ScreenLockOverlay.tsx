import { useEffect, useRef, useState } from "react";
import { Lock, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useServerFn } from "@tanstack/react-start";
import { verifyScreenLockPassword } from "@/lib/screen-lock-password.functions";
import lockBg from "@/assets/screen-lock-bg.jpg";
import { useRouterState } from "@tanstack/react-router";
import { isFanZonePath } from "@/lib/fan-zone-nav";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { useFanAvatarLock } from "@/lib/fan-avatar-lock";
import { BORO_DEFAULT_AVATAR_URL } from "@/lib/boro-default-avatar";

const MAX_ATTEMPTS = 5;

interface Props {
  onUnlock: () => void;
}

export function ScreenLockOverlay({ onUnlock }: Props) {
  const { user, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const verifyPassword = useServerFn(verifyScreenLockPassword);
  const [profile, setProfile] = useState<{ display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const leaveLock = async () => {
    if (user) {
      try {
        localStorage.removeItem(`screenlock:locked:${user.id}`);
      } catch {}
    }
    await signOut();
  };


  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setProfile(data as typeof profile);
    })();
  }, [user?.id]);

  // The lock screen must reflect the site the member was using: BM Support
  // and the Boro Fan Zone have separate identities.
  const path = useRouterState({ select: (st) => st.location.pathname });
  const inFanZone = isFanZonePath(path);
  const fanInfo = useFanZoneMembership(user?.id ?? null);
  const { forcedAvatar } = useFanAvatarLock();

  const supportName = profile?.display_name || profile?.username || "Your account";
  const name = inFanZone
    ? fanInfo?.fanAlias || supportName
    : supportName;
  const avatarSrc = inFanZone
    ? forcedAvatar || fanInfo?.fanAvatarUrl || BORO_DEFAULT_AVATAR_URL
    : profile?.avatar_url || null;

  const tryUnlock = async () => {
    if (!user || submitting.current || !code) return;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await verifyPassword({ data: { password: code } });
      if (!mounted.current) return;
      setCode("");
      if (!result.verified) {
        const next = attempts + 1;
        setAttempts(next);
        if (next >= MAX_ATTEMPTS) {
          toast.error("Too many attempts — signing you out");
          await leaveLock();
          return;
        }
        toast.error(`Incorrect account password (${MAX_ATTEMPTS - next} attempts left)`);
        return;
      }
      onUnlock();
    } catch {
      if (mounted.current) toast.error("Couldn't check your password. Please try again shortly.");
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[300] min-h-dvh overflow-y-auto overscroll-contain bg-background isolate pointer-events-auto touch-auto"
    >
      <img
        src={lockBg}
        alt="Illustration of a person at a computer with a locked screen"
        width={1920}
        height={1088}
        className="fixed inset-0 h-full w-full object-cover pointer-events-none"
      />
      <div className="fixed inset-0 bg-background/40 pointer-events-none" />
      <div className="relative mx-auto my-4 w-[92%] max-w-[420px] rounded-2xl border border-primary/40 bg-background/95 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.7)] overflow-hidden sm:my-[6vh] sm:w-[70%] md:w-[50%] lg:w-[34%] xl:w-[30%]">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
              <AvatarFallback>{(name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-display font-semibold truncate">{name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="size-3" /> Screen locked due to inactivity
              </div>
            </div>
          </div>

          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void tryUnlock(); }}>
            <label htmlFor="screen-lock-password" className="text-sm text-muted-foreground">Account password</label>
            <Input
              id="screen-lock-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              enterKeyHint="done"
              placeholder="Account password"
              value={code}
              disabled={busy}
              className="pointer-events-auto touch-auto text-base"
              onChange={(e) => setCode(e.target.value)}
            />
            <Button type="submit" className="w-full" disabled={busy || !code}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Unlock
            </Button>
          </form>
          <div className="pt-2 border-t border-border space-y-2">
            <p className="text-xs text-muted-foreground">Forgot your password? Sign out to reset it.</p>
            <Button type="button" variant="ghost" size="sm" onClick={() => void leaveLock()} disabled={busy}>
              <LogOut className="size-3" /> Sign out
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

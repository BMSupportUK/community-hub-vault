import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Lock, Loader2, LogOut, ShieldCheck } from "lucide-react";
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
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
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

  const failedPassword = async () => {
    const next = attempts + 1;
    setAttempts(next);
    setStep("password");
    setMfaCode("");
    setFactorId(null);
    if (next >= MAX_ATTEMPTS) {
      toast.error("Too many attempts — signing you out");
      await leaveLock();
      return;
    }
    toast.error(`Incorrect account password (${MAX_ATTEMPTS - next} attempts left)`);
  };

  const tryUnlock = async () => {
    if (!user || submitting.current || !password || (step === "mfa" && (!factorId || mfaCode.length < 6))) return;
    submitting.current = true;
    setBusy(true);
    setMfaError(null);
    try {
      if (step === "mfa" && factorId) {
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: mfaCode.trim() });
        if (error) {
          toast.error(error.message || "Incorrect two-factor code. Please try again.");
          return;
        }
      }

      const result = await verifyPassword({ data: { password, secondFactor: step === "mfa" } });
      if (!mounted.current) return;
      if (!result.verified) {
        await failedPassword();
        return;
      }
      if (result.requiresTwoFactor) {
        if (step === "mfa") {
          toast.error("Couldn't confirm a fresh two-factor code. Please go back and try again.");
          return;
        }
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const factor = (data?.totp ?? []).find((item) => item.status === "verified");
        setFactorId(factor?.id ?? null);
        setMfaCode("");
        setStep("mfa");
        if (!factor) setMfaError("Admin and Staff need a verified authenticator. Sign out and set up 2FA in Security settings before unlocking.");
        return;
      }
      setPassword("");
      setMfaCode("");
      onUnlock();
    } catch (error) {
      if (mounted.current) toast.error(error instanceof Error ? error.message : "Couldn't unlock your screen. Please try again shortly.");
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
            {step === "password" ? (
              <>
                <label htmlFor="screen-lock-password" className="text-sm text-muted-foreground">Account password</label>
                <Input
                  id="screen-lock-password"
                  type="password"
                  autoComplete="current-password"
                  autoFocus
                  enterKeyHint="done"
                  placeholder="Account password"
                  value={password}
                  disabled={busy}
                  className="pointer-events-auto touch-auto text-base"
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck className="size-4 text-primary" /> Two-factor authentication
                </div>
                <p className="text-sm text-muted-foreground">Password accepted. Enter the 6-digit code from your authenticator app to finish unlocking.</p>
                {factorId && (
                  <Input
                    id="screen-lock-mfa"
                    aria-label="6-digit authenticator code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={6}
                    autoFocus
                    enterKeyHint="done"
                    placeholder="123456"
                    value={mfaCode}
                    disabled={busy}
                    className="pointer-events-auto touch-auto text-center text-xl tracking-[0.4em] font-mono"
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  />
                )}
                {mfaError && <p role="alert" className="text-sm text-destructive">{mfaError}</p>}
              </>
            )}
            <Button type="submit" className="w-full" disabled={busy || !password || (step === "mfa" && (!factorId || mfaCode.length < 6))}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : step === "mfa" ? <ShieldCheck className="size-4" /> : <Lock className="size-4" />}
              {step === "mfa" ? "Verify & unlock" : "Unlock"}
            </Button>
            {step === "mfa" && (
              <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => { setStep("password"); setMfaCode(""); setFactorId(null); setMfaError(null); }}>
                <ArrowLeft className="size-4" /> Back to password
              </Button>
            )}
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

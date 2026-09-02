import { useEffect, useState } from "react";
import { Lock, Loader2, ShieldCheck, KeyRound, LogOut, MailQuestion } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { hashLockCode } from "@/lib/screen-lock-hash";
import { requestLockReset } from "@/lib/screen-lock.functions";
import lockBg from "@/assets/screen-lock-bg.jpg";
import type { ScreenLockSettings } from "@/components/app/ScreenLockProvider";

const MAX_ATTEMPTS = 5;

interface Props {
  settings: ScreenLockSettings;
  onUnlock: () => void;
}

export function ScreenLockOverlay({ settings, onUnlock }: Props) {
  const { user, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [useTotp, setUseTotp] = useState(false);
  const [hasTotp, setHasTotp] = useState(false);
  const [profile, setProfile] = useState<{ display_name: string | null; username: string | null; avatar_url: string | null } | null>(null);
  const [requested, setRequested] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");

  const leaveLock = async () => {
    if (user) {
      try {
        localStorage.removeItem(`screenlock:locked:${user.id}`);
      } catch {}
    }
    await signOut();
  };

  const unlockWithPassword = async () => {
    if (!user?.email || password.length < 6) {
      toast.error("Enter your account password");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
    setBusy(false);
    if (error) {
      toast.error("Incorrect password");
      return;
    }
    setPassword("");
    onUnlock();
  };

  // Setup mode: no code set yet. Change mode: temp code used, must set new one.
  const needsSetup = !settings.code_hash;
  const [forceChange, setForceChange] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      setHasTotp((data?.totp ?? []).some((f) => f.status === "verified"));
    })();
  }, []);

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

  const name = profile?.display_name || profile?.username || user?.email || "";

  const saveNewCode = async () => {
    if (!user) return;
    if (!/^\d{4,6}$/.test(newCode)) {
      toast.error("Choose a 4-6 digit code");
      return;
    }
    if (newCode !== confirmCode) {
      toast.error("Codes do not match");
      return;
    }
    setBusy(true);
    const hash = await hashLockCode(user.id, newCode);
    const { error } = await supabase
      .from("screen_lock_settings")
      .update({ code_hash: hash, must_change: false })
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Lock code saved");
    onUnlock();
  };

  const tryUnlock = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (useTotp) {
        const { data } = await supabase.auth.mfa.listFactors();
        const factor = (data?.totp ?? []).find((f) => f.status === "verified");
        if (!factor) {
          toast.error("No authenticator found");
          return;
        }
        const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        if (error) {
          setAttempts((a) => a + 1);
          toast.error("Incorrect authenticator code");
          return;
        }
        onUnlock();
        return;
      }

      const hash = await hashLockCode(user.id, code);
      if (hash !== settings.code_hash) {
        const next = attempts + 1;
        setAttempts(next);
        setCode("");
        if (next >= MAX_ATTEMPTS) {
          toast.error("Too many attempts — signing you out");
          await leaveLock();
          return;
        }
        toast.error(`Incorrect code (${MAX_ATTEMPTS - next} attempts left)`);
        return;
      }
      if (settings.must_change) {
        setForceChange(true);
        setCode("");
        return;
      }
      onUnlock();
    } finally {
      setBusy(false);
    }
  };

  const askForReset = async () => {
    setBusy(true);
    try {
      await requestLockReset();
      setRequested(true);
      toast.success("Reset requested — an owner or manager has been alerted");
    } catch {
      toast.error("Could not send the request. Please contact support.");
    } finally {
      setBusy(false);
    }
  };

  const settingMode = needsSetup || forceChange;

  return (
    <div className="fixed inset-0 z-[200] overflow-hidden">
      <img
        src={lockBg}
        alt="Illustration of a person at a computer with a locked screen"
        width={1920}
        height={1088}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px]" />
      <div className="absolute left-1/2 top-[10%] w-[92%] -translate-x-1/2 sm:w-[70%] md:w-[50%] lg:w-[34%] xl:w-[30%] max-w-[420px] rounded-2xl border border-primary/40 bg-background/75 backdrop-blur-2xl shadow-[0_0_60px_-10px_hsl(var(--primary)/0.7)] overflow-hidden">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Avatar className="size-10">
              {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
              <AvatarFallback>{(name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-display font-semibold truncate">{name}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="size-3" /> Screen locked due to inactivity
              </div>
            </div>
          </div>

          {settingMode ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {needsSetup
                  ? "Set a lock code (4-6 digits). You'll use it to unlock your screen."
                  : "Your temporary code was accepted. Choose a new lock code to continue."}
              </p>
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                placeholder="New code"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ""))}
              />
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                placeholder="Confirm code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
              />
              <Button className="w-full" onClick={saveNewCode} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Save &amp; unlock
              </Button>
            </div>
          ) : usePassword ? (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void unlockWithPassword();
              }}
            >
              <p className="text-sm text-muted-foreground">
                Enter your account password to unlock.
              </p>
              <Input
                type="password"
                autoComplete="current-password"
                autoFocus
                placeholder="Account password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Button type="submit" className="w-full" disabled={busy || password.length < 6}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Unlock
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                onClick={() => {
                  setUsePassword(false);
                  setPassword("");
                }}
              >
                <KeyRound className="size-3" /> Use my lock code instead
              </button>
            </form>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void tryUnlock();
              }}
            >
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                autoFocus
                placeholder={useTotp ? "6-digit authenticator code" : "Lock code"}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <Button type="submit" className="w-full" disabled={busy || code.length < 4}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />} Unlock
              </Button>
              {hasTotp && (
                <button
                  type="button"
                  className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                  onClick={() => {
                    setUseTotp((v) => !v);
                    setCode("");
                  }}
                >
                  <ShieldCheck className="size-3" />
                  {useTotp ? "Use my lock code instead" : "Use authenticator code instead"}
                </button>
              )}
              <button
                type="button"
                className="w-full text-xs text-muted-foreground hover:text-foreground inline-flex items-center justify-center gap-1"
                onClick={() => {
                  setUsePassword(true);
                  setCode("");
                }}
              >
                <KeyRound className="size-3" /> Use my account password instead
              </button>
            </form>
          )}


          <div className="pt-2 border-t border-border flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
              onClick={askForReset}
              disabled={busy || requested}
            >
              <MailQuestion className="size-3" />
              {requested ? "Reset requested" : "Forgot code? Request a reset"}
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              onClick={() => void leaveLock()}
            >
              <LogOut className="size-3" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

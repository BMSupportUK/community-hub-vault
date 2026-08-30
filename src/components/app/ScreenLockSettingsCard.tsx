import { useEffect, useState } from "react";
import { Lock, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_TIMEOUT_MINUTES,
  STAFF_MAX_TIMEOUT_MINUTES,
  STAFF_TIMEOUT_OPTIONS,
  USER_TIMEOUT_OPTIONS,
  hashLockCode,
} from "@/lib/screen-lock-hash";
import { lockScreenNow } from "@/components/app/ScreenLockProvider";

export function ScreenLockSettingsCard() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const options = isStaff ? STAFF_TIMEOUT_OPTIONS : USER_TIMEOUT_OPTIONS;

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [timeout, setTimeoutMins] = useState(DEFAULT_TIMEOUT_MINUTES);
  const [hasCode, setHasCode] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("screen_lock_settings")
        .select("enabled, timeout_minutes, code_hash")
        .eq("user_id", user.id)
        .maybeSingle();
      const row = data as { enabled: boolean; timeout_minutes: number; code_hash: string | null } | null;
      if (row) {
        setEnabled(row.enabled);
        setTimeoutMins(
          isStaff ? Math.min(row.timeout_minutes, STAFF_MAX_TIMEOUT_MINUTES) : row.timeout_minutes,
        );
        setHasCode(Boolean(row.code_hash));
      } else {
        setTimeoutMins(isStaff ? STAFF_MAX_TIMEOUT_MINUTES : DEFAULT_TIMEOUT_MINUTES);
      }
      setLoading(false);
    })();
  }, [user?.id, isStaff]);

  const save = async (patch: { enabled?: boolean; timeout_minutes?: number }) => {
    if (!user) return;
    const next = { enabled, timeout_minutes: timeout, ...patch };
    setEnabled(next.enabled);
    setTimeoutMins(next.timeout_minutes);
    const { error } = await supabase
      .from("screen_lock_settings")
      .update(next)
      .eq("user_id", user.id);
    if (error) toast.error(error.message);
  };

  const saveCode = async () => {
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
      .update({ code_hash: hash, must_change: false, enabled, timeout_minutes: timeout })
      .eq("user_id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHasCode(true);
    setNewCode("");
    setConfirmCode("");
    toast.success("Lock code saved");
  };

  if (loading) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="size-11 rounded-xl grid place-items-center bg-sky-500/15 text-sky-300 ring-1 ring-sky-400/30">
          <Lock className="size-5" />
        </div>
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="font-display font-semibold text-lg">Screen lock</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Locks the app when you&apos;re inactive. Unlock with your lock code
              {" "}or your authenticator code if two-factor is enabled.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="font-medium">Lock when inactive</div>
              {isStaff && (
                <div className="text-xs text-muted-foreground">
                  Required for staff roles (max {STAFF_MAX_TIMEOUT_MINUTES} minutes)
                </div>
              )}
            </div>
            <Switch
              checked={isStaff ? true : enabled}
              disabled={isStaff}
              onCheckedChange={(v) => void save({ enabled: v })}
            />
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Lock after</div>
            <div className="flex flex-wrap gap-2">
              {options.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => void save({ timeout_minutes: m, enabled: true })}
                  className={`px-3 h-9 rounded-lg text-sm border ${
                    timeout === m
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-surface-2 border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-border space-y-2">
            <div className="text-sm font-medium">{hasCode ? "Change lock code" : "Set lock code"}</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="New code (4-6 digits)"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.replace(/\D/g, ""))}
              />
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="Confirm code"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
              />
              <Button onClick={saveCode} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Save
              </Button>
            </div>
            {!hasCode && (
              <p className="text-xs text-amber-300">
                No code set yet — you&apos;ll be asked to create one the first time your screen locks.
              </p>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={() => lockScreenNow()}>
            <Lock className="size-4" /> Lock screen now
          </Button>
        </div>
      </div>
    </div>
  );
}

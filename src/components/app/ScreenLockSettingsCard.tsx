import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  ADMIN_MAX_TIMEOUT_MINUTES,
  ADMIN_TIMEOUT_OPTIONS,
  DEFAULT_TIMEOUT_MINUTES,
  STAFF_MAX_TIMEOUT_MINUTES,
  STAFF_TIMEOUT_OPTIONS,
  USER_TIMEOUT_OPTIONS,
} from "@/lib/screen-lock-hash";
import { lockScreenNow } from "@/components/app/ScreenLockProvider";

export function ScreenLockSettingsCard() {
  const { user, hasAny } = useAuth();
  const isAdmin = hasAny(["admin"]);
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const maxMins = isAdmin ? ADMIN_MAX_TIMEOUT_MINUTES : STAFF_MAX_TIMEOUT_MINUTES;
  const options = isAdmin ? ADMIN_TIMEOUT_OPTIONS : isStaff ? STAFF_TIMEOUT_OPTIONS : USER_TIMEOUT_OPTIONS;

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [timeout, setTimeoutMins] = useState(DEFAULT_TIMEOUT_MINUTES);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("screen_lock_settings")
        .select("enabled, timeout_minutes")
        .eq("user_id", user.id)
        .maybeSingle();
      const row = data as { enabled: boolean; timeout_minutes: number } | null;
      if (row) {
        setEnabled(row.enabled);
        setTimeoutMins(isStaff ? Math.min(row.timeout_minutes, maxMins) : row.timeout_minutes);
      } else {
        setTimeoutMins(isStaff ? maxMins : DEFAULT_TIMEOUT_MINUTES);
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
              Locks the app when you&apos;re inactive. Unlock with your account password.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="text-sm">
              <div className="font-medium">Lock when inactive</div>
              {isStaff && (
                <div className="text-xs text-muted-foreground">
                  Required for staff roles (max {maxMins} minutes)
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
                <Button
                  variant={timeout === m ? "default" : "outline"}
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
                </Button>
              ))}
            </div>
          </div>

          <Button variant="outline" size="sm" onClick={() => lockScreenNow()}>
            <Lock className="size-4" /> Lock screen now
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Loader2, Users, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Privacy preference: hide the Boro Fan Zone friends list (and friend count)
 * from everyone else. The owner always still sees their own friends.
 */
export function FanZoneFriendsPrivacyCard() {
  const { user } = useAuth();
  const [hide, setHide] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("fan_zone_members")
        .select("hide_friends")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setHide(!!data?.hide_friends);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const toggle = async (next: boolean) => {
    setSaving(true);
    const { error } = await supabase.rpc("fan_zone_set_hide_friends", { _hide: next });
    setSaving(false);
    if (error) return toast.error("Couldn't save", { description: error.message });
    setHide(next);
    toast.success(next ? "Your friends list is now hidden" : "Your friends list is now visible");
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-start gap-4">
        <div className="size-11 rounded-xl grid place-items-center bg-primary/15 text-primary ring-1 ring-primary/30">
          <Users className="size-5" />
        </div>
        <div className="flex-1">
          <h2 className="font-display font-semibold text-lg">Boro Fan Zone friends list</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose whether other fans can see who you are friends with. You can always see your own friends.
          </p>

          {hide === null ? (
            <p className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Loading your setting…
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1 size-4 accent-current"
                  checked={hide}
                  disabled={saving}
                  onChange={(e) => void toggle(e.target.checked)}
                />
                <span className="text-sm">
                  <span className="font-medium flex items-center gap-1.5">
                    <EyeOff className="size-4" /> Hide my friends list
                  </span>
                  <span className="block text-muted-foreground mt-0.5">
                    Your friends and your friend count are hidden from other fans on your profile.
                  </span>
                </span>
              </label>
              <div
                className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full ring-1 ${
                  hide
                    ? "bg-amber-500/15 text-amber-300 ring-amber-400/30"
                    : "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
                }`}
              >
                {hide ? "Hidden from other fans" : "Visible to other fans"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

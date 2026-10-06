import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { clearNameplateCache } from "@/lib/nameplates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STAFF = ["admin", "management", "staff", "moderator"];
const EXCLUDED = ["pending", "banned", "rejected"];
const FAN_ZONE = ["boro_fan_zone_member", "boro_fan_zone_moderator"];

/** Asks BM Support users once to pick Male/Female for their default name plate. */
export function StaffGenderPrompt() {
  const { user, roles } = useAuth();
  const isStaff = roles.some((r) => STAFF.includes(r as string));
  const isExcluded = roles.some((r) => EXCLUDED.includes(r as string));
  const hasSupportRole = roles.some((r) => !FAN_ZONE.includes(r as string));
  const isBmSupportUser = isStaff || (!isExcluded && (roles.length === 0 || hasSupportRole));
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<"male" | "female" | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user || !isBmSupportUser) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("staff_gender_confirmed_at")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data && !data.staff_gender_confirmed_at) setOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, [user, isBmSupportUser]);

  const save = async () => {
    if (!user || !choice) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ staff_gender: choice, staff_gender_confirmed_at: new Date().toISOString() })
      .eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    clearNameplateCache();
    toast.success("Profile updated");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-sm max-h-[85dvh] overflow-y-auto [&>button.absolute]:hidden" onInteractOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Complete your profile</DialogTitle>
          <DialogDescription>
            Please choose Male or Female so your default name plate shows the right icon. You can change this later in Edit profile.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {(["male", "female"] as const).map((g) => (
            <Button
              key={g}
              type="button"
              variant={choice === g ? "default" : "outline"}
              onClick={() => setChoice(g)}
            >
              {g === "male" ? "Male" : "Female"}
            </Button>
          ))}
        </div>
        <Button onClick={save} disabled={!choice || saving} className="w-full">
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { useEffect, useRef } from "react";
import { Trophy, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Auto-popping dialog that invites regular users to request Boro Fan Zone access.
 * - Hidden for staff/mod roles entirely.
 * - Hidden for approved or pending members.
 * - Opens once per browser session for users who haven't requested yet
 *   (status: none / rejected / revoked).
 */
const SESSION_KEY = "fan-zone-dialog-shown";

export function FanZoneAccessCard() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management", "staff", "moderator"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const autoOpenedRef = useRef(false);

  const eligible =
    !!user &&
    !isStaff &&
    !!info &&
    (info.status === "none" || info.status === "rejected" || info.status === "revoked");

  useEffect(() => {
    if (!eligible || autoOpenedRef.current) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SESSION_KEY)) return;
    autoOpenedRef.current = true;
    window.sessionStorage.setItem(SESSION_KEY, "1");
    setOpen(true);
  }, [eligible]);

  if (!eligible) return null;

  const submit = async () => {
    setSubmitting(true);
    const reason = message.trim().slice(0, 280) || null;
    let error;
    if (info!.status === "none") {
      ({ error } = await supabase
        .from("fan_zone_members")
        .insert({ user_id: user.id, status: "pending", reason }));
    } else {
      ({ error } = await supabase
        .from("fan_zone_members")
        .update({ status: "pending", reason, note: null, decided_at: null, decided_by: null })
        .eq("user_id", user!.id));
    }
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't submit request", { description: error.message });
      return;
    }
    toast.success("Request sent — we'll let you know.");
    setOpen(false);
    setMessage("");
  };

  const ctaLabel = info!.status === "none" ? "Request access" : "Ask again";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-300" /> Join the Boro Fan Zone
            </DialogTitle>
            <DialogDescription>
              Tell us briefly why you'd like in — match-day banter, transfer talk, the lot. An admin will review your request.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 280))}
            placeholder="e.g. Season ticket holder since 2010, love the away days."
            rows={4}
            maxLength={280}
          />
          <div className="text-[11px] text-muted-foreground text-right">
            {message.length}/280
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Not now
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Check className="size-4 mr-1" /> {ctaLabel}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}
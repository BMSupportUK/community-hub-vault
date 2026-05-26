import { useState } from "react";
import { Trophy, Lock, Loader2, Check, X, Clock, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
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
 * Sidebar card that gates access to the Boro Fan Zone.
 * - Non-member: shows request CTA.
 * - Pending: shows waiting state.
 * - Approved: hidden — channels show in the main list instead.
 * - Rejected/revoked: shows status with optional re-request.
 * - Admin/management: hidden (they always see the zone).
 */
export function FanZoneAccessCard() {
  const { user, hasAny } = useAuth();
  const isStaff = hasAny(["admin", "management"]);
  const info = useFanZoneMembership(user?.id ?? null);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!user || isStaff) return null;
  if (!info) return null;
  if (info.status === "approved") {
    return (
      <section className="px-2 pt-3">
        <Link
          to="/forum"
          className="block rounded-lg border border-rose-500/40 bg-gradient-to-br from-rose-600/20 via-amber-500/10 to-rose-600/20 overflow-hidden hover:border-rose-400 transition-colors"
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <Trophy className="size-3.5 text-amber-300" />
            <h2 className="font-display text-[11px] font-bold tracking-wider uppercase flex-1">Boro Fan Zone</h2>
            <ArrowRight className="size-3.5 text-amber-300" />
          </div>
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Enter the forum — boards, topics & match-day banter.
          </div>
        </Link>
      </section>
    );
  }

  const canRequest = info.status === "none" || info.status === "rejected" || info.status === "revoked";

  const submit = async () => {
    setSubmitting(true);
    const reason = message.trim().slice(0, 280) || null;
    let error;
    if (info.status === "none") {
      ({ error } = await supabase
        .from("fan_zone_members")
        .insert({ user_id: user.id, status: "pending", reason }));
    } else {
      ({ error } = await supabase
        .from("fan_zone_members")
        .update({ status: "pending", reason, note: null, decided_at: null, decided_by: null })
        .eq("user_id", user.id));
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

  const tone =
    info.status === "pending"
      ? "from-amber-600/20 via-amber-500/10 to-amber-600/20 border-amber-500/40"
      : info.status === "rejected" || info.status === "revoked"
        ? "from-rose-600/20 via-rose-500/10 to-rose-600/20 border-rose-500/40"
        : "from-rose-600/20 via-amber-500/10 to-rose-600/20 border-rose-500/40";

  const statusLabel =
    info.status === "pending"
      ? { icon: Clock, text: "Awaiting approval", sub: "We'll ping you when it's in." }
      : info.status === "rejected"
        ? { icon: X, text: "Request declined", sub: info.note ?? "Tap to ask again." }
        : info.status === "revoked"
          ? { icon: Lock, text: "Access removed", sub: info.note ?? "Tap to request again." }
          : { icon: Trophy, text: "Boro Fan Zone", sub: "Up the Boro — request access." };

  const Icon = statusLabel.icon;

  return (
    <section className="px-2 pt-3">
      <div className={`rounded-lg bg-gradient-to-br ${tone} border overflow-hidden`}>
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
          <Trophy className="size-3.5 text-amber-300" />
          <h2 className="font-display text-[11px] font-bold tracking-wider uppercase">
            Boro Fan Zone
          </h2>
        </div>
        <div className="px-3 py-3 space-y-2 text-xs">
          <div className="flex items-start gap-2">
            <Icon className="size-4 shrink-0 mt-0.5 text-foreground/80" />
            <div className="min-w-0">
              <div className="font-semibold">{statusLabel.text}</div>
              <div className="text-muted-foreground mt-0.5">{statusLabel.sub}</div>
            </div>
          </div>
          {canRequest && (
            <Button
              size="sm"
              onClick={() => setOpen(true)}
              className="w-full h-7 text-xs bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 border-0"
            >
              {info.status === "none" ? "Request access" : "Ask again"}
            </Button>
          )}
        </div>
      </div>

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
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="size-4 mr-1 animate-spin" /> Sending…
                </>
              ) : (
                <>
                  <Check className="size-4 mr-1" /> Send request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
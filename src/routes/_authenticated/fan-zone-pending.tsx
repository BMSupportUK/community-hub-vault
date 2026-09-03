import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, LogOut, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { FanZoneNameGate } from "@/components/app/FanZoneNamePrompt";
import { useFanZoneMembership } from "@/hooks/use-fan-zone";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import pendingStadium from "@/assets/fan-zone-pending-stadium.jpg";


export const Route = createFileRoute("/_authenticated/fan-zone-pending")({
  component: FanZonePendingPage,
});

function FanZonePendingPage() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const info = useFanZoneMembership(user?.id ?? null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // If they were approved while on this page, send them in.
  useEffect(() => {
    if (info?.status === "approved") navigate({ to: "/fan-zone" });
  }, [info?.status, navigate]);

  const submitRequest = async () => {
    if (!user) return;
    setSubmitting(true);
    const reason = reasonDraft.trim().slice(0, 500) || null;
    const { error } =
      info?.status === "none" || !info
        ? await supabase.from("fan_zone_members").insert({ user_id: user.id, status: "pending", reason })
        : await supabase
            .from("fan_zone_members")
            .update({ status: "pending", reason, note: null, decided_at: null, decided_by: null })
            .eq("user_id", user.id);
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't send your request — please try again.");
      return;
    }
    toast.success("Request sent — a Fan Zone moderator will review it.");
    setReasonDraft("");
  };




  const status = info?.status ?? "none";

  return (
    <div className="relative min-h-dvh w-full flex items-center justify-center px-4 py-10 overflow-hidden">
      <img
        src={pendingStadium}
        alt="Middlesbrough supporter in the official red home shirt watching a floodlit match from the stands"
        width={1536}
        height={1024}
        className="absolute inset-0 size-full object-cover object-top"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-zinc-950/45 via-zinc-950/65 to-zinc-950/90" />
      <FanZoneNameGate />
      <div className="relative z-10 w-full max-w-md">
        <button
          onClick={async () => { await signOut(); navigate({ to: "/login" }); }}
          className="absolute -top-6 right-0 text-xs text-white/60 hover:text-white inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-white/10"
        >
          <LogOut className="size-3" /> Sign out
        </button>

        <div className="rounded-2xl border border-red-500/40 bg-zinc-950/70 backdrop-blur-md p-8 shadow-2xl text-center">
          <div className="mx-auto mb-5 size-16 rounded-full bg-red-500/15 border border-red-400/40 flex items-center justify-center">
            {status === "pending" ? (
              <Loader2 className="size-7 text-red-300 animate-spin" />
            ) : (
              <Trophy className="size-7 text-red-300" />
            )}
          </div>

          <div className="text-[11px] uppercase tracking-[0.2em] text-red-300/80 font-semibold mb-2">
            Boro Fan Zone
          </div>

          <h1 className="font-display text-2xl font-bold text-white mb-2">
            {status === "pending"
              ? "Pending Activation"
              : status === "rejected"
              ? "Request Was Declined"
              : status === "revoked"
              ? "Access Was Revoked"
              : "Join the Boro Fan Zone - a Middlesbrough F.C. Forum"}
          </h1>

          <p className="text-sm text-white/70 max-w-sm mx-auto mb-1">
            {status === "pending"
              ? "Your Boro Fan Zone account is waiting for the owner to grant access — no security checks needed."
              : status === "rejected" || status === "revoked"
              ? "You can submit a new request below — keep it civil and tell us why you want in."
              : "Tell us a bit about yourself and the owner will review your request."}
          </p>
          {status === "pending" && (
            <p className="text-sm text-white/70 max-w-sm mx-auto mb-5">
              The owner has been notified and you'll be let straight in as soon as it's approved.
            </p>
          )}

          {info?.reason && status === "pending" ? (
            <div className="rounded-lg border border-white/10 bg-white/5 p-3 mb-5 text-left">
              <div className="text-[11px] uppercase tracking-wider text-white/50 font-semibold mb-1">Your request</div>
              <p className="text-sm text-white/90 italic">"{info.reason}"</p>
            </div>
          ) : null}

          {status !== "pending" && (
            <div className="mt-5 space-y-3 text-left">
              <label className="block text-xs uppercase tracking-wider text-red-300/90">
                Why do you want in?
              </label>
              <textarea
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value.slice(0, 500))}
                rows={4}
                maxLength={500}
                placeholder="e.g. Season ticket holder since 2010, love the away days."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-red-500/60 resize-none"
              />
              <div className="text-right text-[11px] text-white/40">{reasonDraft.length}/500</div>
              <Button
                onClick={submitRequest}
                disabled={submitting || reasonDraft.trim().length < 10}
                className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white"
              >
                {submitting ? "Sending…" : "Send request"}
              </Button>
            </div>
          )}

          <div className="mt-6 flex items-center justify-center gap-3 text-xs">
            <Button asChild variant="ghost" size="sm" className="text-white/70 hover:text-white">
              <Link to="/fan-zone">Browse Fan Zone</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-white/70 hover:text-white">
              <Link to="/">Back to home</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
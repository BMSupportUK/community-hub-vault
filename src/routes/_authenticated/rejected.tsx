import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Ban, LogOut, MessageSquarePlus, X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/rejected")({
  component: RejectedPage,
});

function RejectedPage() {
  const { user, signOut, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const submitAppeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < 10) return toast.error("Please provide at least 10 characters.");
    if (!user) return;
    setSubmitting(true);
    const { data, error } = await supabase.rpc("submit_appeal", { p_reason: trimmed });
    if (error) {
      setSubmitting(false);
      return toast.error(error.message);
    }
    const ref = (data as { reference?: string } | null)?.reference ?? "APPEAL";
    toast.success(`Appeal submitted — reference ${ref}`);
    await refreshRoles();
    navigate({ to: "/gate", search: { chat: 1 } as never });
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-black">
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/70" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(220,38,38,0.25),transparent_65%)]" />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <div className="size-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center shadow-[0_0_60px_rgba(239,68,68,0.6)] ring-2 ring-red-500/40 mb-6">
          <Ban className="size-10 text-white" strokeWidth={2.5} />
        </div>

        <h1 className="font-display text-4xl md:text-5xl font-extrabold text-white tracking-tight">
          Membership Rejected
        </h1>
        <p className="mt-3 text-red-200/90 text-base max-w-md">
          Your membership request has been rejected. If you believe this is a mistake,
          you can open an appeal and a moderator will review it.
        </p>

        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 shadow-[0_8px_30px_rgba(220,38,38,0.45)] transition-all"
          >
            <MessageSquarePlus className="size-4" /> Open an appeal
          </button>
          <button
            onClick={handleSignOut}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-medium text-white/80 hover:text-white border border-white/15 hover:bg-white/5 transition-all"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <form
            onSubmit={submitAppeal}
            className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-zinc-950/95 shadow-2xl overflow-hidden"
          >
            <header className="h-14 px-5 flex items-center justify-between border-b border-white/10">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-full bg-gradient-to-br from-red-500 to-red-700 grid place-items-center">
                  <MessageSquarePlus className="size-4 text-white" />
                </div>
                <div className="font-display font-semibold text-white text-sm">Submit an appeal</div>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="text-white/60 hover:text-white">
                <X className="size-5" />
              </button>
            </header>
            <div className="p-5 space-y-4">
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-100/90">
                Your appeal will be tagged with reference <span className="font-mono font-semibold">APPEAL</span> and reviewed by a moderator.
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-red-300/80 mb-2">
                  Explain your appeal
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, 1000))}
                  rows={6}
                  required
                  minLength={10}
                  maxLength={1000}
                  placeholder="Why should we reconsider your membership?"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none focus:border-red-500/50 resize-none"
                  autoFocus
                />
                <div className="flex justify-between mt-1.5 text-[11px]">
                  <span className="text-white/40">Minimum 10 characters</span>
                  <span className="text-white/40">{text.length}/1000</span>
                </div>
              </div>
            </div>
            <footer className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm px-3 py-2 rounded-lg text-white/70 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || text.trim().length < 10}
                className="text-sm px-4 py-2 rounded-lg font-semibold text-white bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 disabled:opacity-50 shadow-[0_4px_20px_rgba(220,38,38,0.4)]"
              >
                {submitting ? "Submitting…" : "Submit appeal"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </div>
  );
}

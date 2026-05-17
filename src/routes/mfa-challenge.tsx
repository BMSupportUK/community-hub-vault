import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, LifeBuoy, Mail } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { requestMfaReset } from "@/lib/mfa-reset-request.functions";
import mfaBg from "@/assets/mfa-security-bg.jpg";

export const Route = createFileRoute("/mfa-challenge")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/login" });
  },
  component: MfaChallengePage,
});

function MfaChallengePage() {
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReset, setShowReset] = useState(false);
  const [reason, setReason] = useState("");
  const [sendingReset, setSendingReset] = useState(false);
  const requestReset = useServerFn(requestMfaReset);

  useEffect(() => {
    (async () => {
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal.data?.currentLevel === "aal2") {
        navigate({ to: "/home", replace: true });
        return;
      }
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) { toast.error(error.message); setLoading(false); return; }
      const totp = (data?.totp ?? []).find((f) => f.status === "verified");
      if (!totp) {
        // No factor — nothing to challenge. Send them home.
        navigate({ to: "/home", replace: true });
        return;
      }
      setFactorId(totp.id);
      setLoading(false);
    })();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Verified");
    navigate({ to: "/home", replace: true });
  };

  return (
    <div className="relative min-h-screen grid place-items-center px-4 bg-background overflow-hidden">
      <img
        src={mfaBg}
        alt=""
        aria-hidden="true"
        width={1920}
        height={1080}
        className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover opacity-70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background)/0.55)_55%,hsl(var(--background)/0.92)_100%)]"
      />
      <div className="relative w-full max-w-md">
        <div className="bg-surface/70 backdrop-blur-md border border-primary/30 rounded-2xl p-8 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.5)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="size-10 rounded-xl bg-gradient-primary grid place-items-center shadow-glow">
              <ShieldCheck className="size-5 text-primary-foreground" />
            </div>
            <h1 className="font-display text-2xl font-bold">Two-factor authentication</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            Enter the 6-digit code from your authenticator app to continue.
          </p>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="123456"
                className="w-full h-14 text-center text-2xl tracking-[0.5em] font-mono rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
              />
              <button
                disabled={busy || code.length < 6}
                className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50"
              >
                {busy ? "Verifying…" : "Verify"}
              </button>
            </form>
          )}
          <div className="mt-6 pt-6 border-t border-border text-xs text-muted-foreground space-y-2">
            <button
              type="button"
              onClick={() => setShowReset((v) => !v)}
              className="flex items-center gap-1.5 hover:text-primary"
            >
              <LifeBuoy className="size-3.5" /> Lost your device? Request a 2FA reset
            </button>
            {showReset && (
              <div className="mt-2 rounded-lg border border-border bg-background p-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  We'll email our admin team and send you a confirmation. They'll verify your identity before resetting.
                </p>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value.slice(0, 500))}
                  placeholder="Optional: what happened to your device?"
                  rows={2}
                  className="w-full text-xs rounded-md bg-input border border-border p-2 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  disabled={sendingReset}
                  onClick={async () => {
                    setSendingReset(true);
                    try {
                      const r = await requestReset({ data: { reason: reason || undefined } });
                      toast.success(`Request sent — ${r.notifiedAdmins} admin(s) notified`);
                      setShowReset(false);
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to send request");
                    }
                    setSendingReset(false);
                  }}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50"
                >
                  <Mail className="size-3.5" />
                  {sendingReset ? "Sending…" : "Send reset request"}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/login" }); }}
              className="hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

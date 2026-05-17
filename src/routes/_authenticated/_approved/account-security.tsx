import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff, Loader2, KeyRound, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/_approved/account-security")({
  component: AccountSecurityPage,
});

type Factor = { id: string; status: string; friendly_name: string | null };

function AccountSecurityPage() {
  const [loading, setLoading] = useState(true);
  const [factor, setFactor] = useState<Factor | null>(null);

  // Enrollment state
  const [enrolling, setEnrolling] = useState(false);
  const [newFactorId, setNewFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Removal state
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeCode, setRemoveCode] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) { toast.error(error.message); setLoading(false); return; }
    const verified = (data?.totp ?? []).find((f) => f.status === "verified");
    setFactor(verified ? { id: verified.id, status: verified.status, friendly_name: verified.friendly_name ?? null } : null);
    // Clean up any stale unverified factors so re-enrolling is fresh
    for (const f of data?.totp ?? []) {
      if (f.status !== "verified") {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startEnroll = async () => {
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNewFactorId(data.id);
    setQr(data.totp.qr_code);
    setSecret(data.totp.secret);
    setEnrolling(true);
  };

  const cancelEnroll = async () => {
    if (newFactorId) await supabase.auth.mfa.unenroll({ factorId: newFactorId });
    setEnrolling(false);
    setNewFactorId(null);
    setQr(null);
    setSecret(null);
    setCode("");
  };

  const confirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFactorId) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: newFactorId,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Two-factor authentication enabled");
    setEnrolling(false);
    setNewFactorId(null); setQr(null); setSecret(null); setCode("");
    load();
  };

  const confirmRemove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factor) return;
    setBusy(true);
    // Require a fresh code to prove possession before unenroll
    const { error: verErr } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code: removeCode.trim(),
    });
    if (verErr) { setBusy(false); return toast.error(verErr.message); }
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Two-factor authentication removed");
    setRemoveOpen(false);
    setRemoveCode("");
    load();
  };

  return (
    <main className="flex-1 overflow-y-auto">
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-700 via-violet-700 to-fuchsia-700" />
        <div className="relative p-6 md:p-10 text-white">
          <Link to="/home" className="inline-flex items-center gap-1 text-xs text-white/70 hover:text-white mb-3">
            <ArrowLeft className="size-3.5" /> Back
          </Link>
          <div className="text-xs uppercase tracking-[0.2em] text-violet-200/80 mb-3 flex items-center gap-2">
            <ShieldCheck className="size-3.5" /> Account · Security
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold">Security</h1>
          <p className="mt-3 text-white/80 max-w-xl">
            Add a second step at sign-in so a stolen password is not enough to access your account.
          </p>
        </div>
      </section>

      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="rounded-2xl border border-border bg-surface p-6">
          <div className="flex items-start gap-4">
            <div className={`size-11 rounded-xl grid place-items-center ${factor ? "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30" : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30"}`}>
              <KeyRound className="size-5" />
            </div>
            <div className="flex-1">
              <h2 className="font-display font-semibold text-lg">Authenticator app (TOTP)</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Use Google Authenticator, Authy, 1Password, Bitwarden or similar.
              </p>

              {loading ? (
                <p className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" /> Checking status…
                </p>
              ) : factor ? (
                <div className="mt-4 space-y-3">
                  <div className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
                    <ShieldCheck className="size-4" /> 2FA is active
                  </div>
                  <div>
                    <button
                      onClick={() => setRemoveOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-surface-2 border border-border hover:border-rose-400/50 hover:text-rose-300 text-sm"
                    >
                      <ShieldOff className="size-4" /> Remove 2FA
                    </button>
                  </div>
                </div>
              ) : enrolling ? (
                <form onSubmit={confirmEnroll} className="mt-4 space-y-4">
                  <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                    <li>Open your authenticator app and add a new account.</li>
                    <li>Scan the QR code below — or paste the setup key.</li>
                    <li>Enter the 6-digit code the app shows to confirm.</li>
                  </ol>
                  {qr && (
                    <div className="grid place-items-center p-4 rounded-xl bg-white">
                      <img src={qr} alt="2FA QR code" className="size-48" />
                    </div>
                  )}
                  {secret && (
                    <div className="text-xs">
                      <div className="text-muted-foreground mb-1">Setup key (if you can't scan)</div>
                      <code className="block px-3 py-2 rounded bg-surface-2 border border-border font-mono break-all">{secret}</code>
                    </div>
                  )}
                  <input
                    inputMode="numeric" pattern="[0-9]*" maxLength={8} required autoFocus
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456"
                    className="w-full h-12 text-center text-xl tracking-[0.4em] font-mono rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <div className="flex gap-2">
                    <button disabled={busy || code.length < 6} className="flex-1 h-11 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
                      {busy ? "Verifying…" : "Confirm & enable"}
                    </button>
                    <button type="button" onClick={cancelEnroll} disabled={busy} className="px-4 h-11 rounded-lg bg-surface-2 border border-border text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4">
                  <button
                    onClick={startEnroll}
                    disabled={busy}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm disabled:opacity-50"
                  >
                    <ShieldCheck className="size-4" /> Enable two-factor authentication
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted-foreground">
          <h3 className="font-display font-semibold text-foreground mb-2">Lost your device?</h3>
          <p>
            If you lose access to your authenticator app, raise a support ticket and our staff will verify your identity and reset 2FA on your account.
          </p>
          <Link
            to="/tickets"
            search={{ id: undefined, view: undefined, new2fa: 1 } as never}
            className="inline-block mt-3 text-primary hover:underline"
          >
            Contact support →
          </Link>
        </div>
      </div>

      {removeOpen && factor && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4">
          <form onSubmit={confirmRemove} className="w-full max-w-md rounded-2xl bg-surface border border-border p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg">Remove 2FA</h2>
            <p className="text-sm text-muted-foreground">
              For your safety, enter the current 6-digit code from your authenticator app to confirm.
            </p>
            <input
              inputMode="numeric" pattern="[0-9]*" maxLength={8} required autoFocus
              value={removeCode}
              onChange={(e) => setRemoveCode(e.target.value.replace(/\D/g, ""))}
              placeholder="123456"
              className="w-full h-12 text-center text-xl tracking-[0.4em] font-mono rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-2">
              <button disabled={busy || removeCode.length < 6} className="flex-1 h-11 rounded-lg bg-rose-600 text-white font-medium disabled:opacity-50">
                {busy ? "Removing…" : "Remove 2FA"}
              </button>
              <button type="button" onClick={() => { setRemoveOpen(false); setRemoveCode(""); }} disabled={busy} className="px-4 h-11 rounded-lg bg-surface-2 border border-border text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

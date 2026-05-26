import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "./login";
import resetIllustration from "@/assets/reset-password-illustration.webp";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/home" });
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      <aside className="relative hidden lg:flex items-center justify-center overflow-hidden bg-gradient-to-br from-blue-700/40 via-cyan-600/30 to-violet-700/40 border-r border-border">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-[28rem] rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute top-1/3 right-10 size-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative z-10 max-w-lg px-10 text-center">
          <img
            src={resetIllustration}
            alt="Illustration of a person resetting their forgotten password on a computer"
            width={1024}
            height={1024}
            loading="lazy"
            className="w-full h-auto drop-shadow-[0_25px_60px_rgba(59,130,246,0.45)]"
          />
          <h2 className="font-display text-2xl font-bold mt-6 text-foreground">
            Forgot your password?
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            No worries — choose a new one and you'll be back in the community in seconds.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 justify-center mb-8">
            <div className="size-9 rounded-xl bg-gradient-primary shadow-glow grid place-items-center font-display font-bold text-[13px] text-primary-foreground">BM</div>
            <span className="font-display font-bold text-lg">Support Community</span>
          </Link>
          <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-soft">
            <h1 className="font-display text-2xl font-bold">Set a new password</h1>
            <p className="text-sm text-muted-foreground mb-6">Enter your new password below.</p>
            <form onSubmit={submit} className="space-y-3">
              <Field label="New password" type="password" value={password} onChange={setPassword} />
              <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} />
              <button disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50">
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>
            <div className="text-sm text-muted-foreground text-center mt-6">
              Remembered it?{" "}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
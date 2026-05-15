import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/home" });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/home" });
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail) return;
    setResetBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset email sent. Check your inbox.");
    setForgotOpen(false);
    setResetEmail("");
  };

  return (
    <AuthFrame title="Sign in" subtitle="Welcome back to the server.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        <button disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="text-right">
          <button
            type="button"
            onClick={() => { setResetEmail(email); setForgotOpen(true); }}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            Forgot password?
          </button>
        </div>
      </form>
      <div className="text-sm text-muted-foreground text-center mt-6">
        New here?{" "}
        <Link to="/signup" className="text-primary hover:underline">Request access</Link>
      </div>
      {forgotOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
          <form onSubmit={sendReset} className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-soft space-y-4">
            <div>
              <h2 className="font-display text-lg font-bold">Reset password</h2>
              <p className="text-xs text-muted-foreground mt-1">Enter your email and we'll send you a reset link.</p>
            </div>
            <Field label="Email" type="email" value={resetEmail} onChange={setResetEmail} />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="px-3 h-10 rounded-lg text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetBusy}
                className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >
                {resetBusy ? "Sending…" : "Send reset link"}
              </button>
            </div>
          </form>
        </div>
      )}
    </AuthFrame>
  );
}

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="h-9 px-3 rounded-xl bg-gradient-primary shadow-glow grid place-items-center font-display font-bold text-[10px] text-primary-foreground whitespace-nowrap">Support Community</div>
          <span className="font-display font-bold text-lg">Hub</span>
        </Link>
        <div className="bg-surface border border-border rounded-2xl p-8 shadow-soft">
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground mb-6">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Field({
  label, type = "text", value, onChange,
}: { label: string; type?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full h-11 px-3 rounded-lg bg-input border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </label>
  );
}

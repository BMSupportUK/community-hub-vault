import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import loginIllustration from "@/assets/login-illustration.png";

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    navigate({ to: "/home" });
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      {/* Illustration panel */}
      <aside className="relative hidden lg:flex items-center justify-center overflow-hidden bg-gradient-to-br from-violet-700/40 via-fuchsia-600/30 to-blue-700/40 border-r border-border">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-[28rem] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute top-1/3 right-10 size-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative z-10 max-w-lg px-10 text-center">
          <img
            src={loginIllustration}
            alt="Illustration of a person signing into their account on a laptop"
            width={1024}
            height={1024}
            className="w-full h-auto drop-shadow-[0_25px_60px_rgba(139,92,246,0.45)]"
          />
          <h2 className="font-display text-2xl font-bold mt-6 text-foreground">
            Welcome back to the community
          </h2>
          <p className="text-sm text-muted-foreground mt-2">
            Sign in to continue helping customers, joining channels, and tracking your shifts.
          </p>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2 justify-center mb-8">
            <div className="size-9 rounded-xl bg-gradient-primary shadow-glow grid place-items-center font-display font-bold text-[13px] text-primary-foreground">BM</div>
            <span className="font-display font-bold text-lg">Support Community</span>
          </Link>
          <div className="bg-surface/80 backdrop-blur-sm border border-border rounded-2xl p-8 shadow-soft">
            <h1 className="font-display text-2xl font-bold">Sign in</h1>
            <p className="text-sm text-muted-foreground mb-6">Welcome back to the server.</p>
            <form onSubmit={submit} className="space-y-3">
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        <button disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="text-right">
          <Link
            to="/forgot-password"
            className="text-xs text-muted-foreground hover:text-primary"
          >
            Forgot password?
          </Link>
        </div>
      </form>
      <div className="text-sm text-muted-foreground text-center mt-6">
        New here?{" "}
        <Link to="/signup" className="text-primary hover:underline">Request access</Link>
      </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="size-9 rounded-xl bg-gradient-primary shadow-glow grid place-items-center font-display font-bold text-[13px] text-primary-foreground">BM</div>
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

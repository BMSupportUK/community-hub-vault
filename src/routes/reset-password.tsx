import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Field } from "./login";
import resetIllustration from "@/assets/reset-password-illustration.webp";
import { useServerFn } from "@tanstack/react-start";
import { completeRequiredPasswordChange } from "@/lib/temp-password.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({ forced: s.forced === "1" || s.forced === 1 ? "1" : undefined }),
  head: () => ({
    meta: [
      { title: "Set a new password — BM Support" },
      { name: "description", content: "Choose a new password for your BM Support account." },
      { property: "og:title", content: "Set a new password — BM Support" },
      { property: "og:description", content: "Choose a new password for your BM Support account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const forced = Route.useSearch().forced === "1";
  const completeChange = useServerFn(completeRequiredPasswordChange);
  const [currentPassword, setCurrentPassword] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsProfile, setNeedsProfile] = useState(false);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    setRecovery(new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery");
    supabase.auth.getUser().then(({ data }) => setNeedsProfile(!!data.user?.user_metadata?.needs_profile));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error("Password must be at least 6 characters.");
    if (password !== confirm) return toast.error("Passwords don't match.");
    const uname = username.trim();
    const dname = displayName.trim();
    if (needsProfile) {
      if (!/^[A-Za-z0-9_.-]{2,30}$/.test(uname)) return toast.error("Username must be 2–30 letters, numbers, _ . or -");
      if (dname.length < 1 || dname.length > 60) return toast.error("Please enter a display name.");
    }
    setBusy(true);
    if (needsProfile) {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (u) {
        const { error: pErr } = await supabase.from("profiles").update({ username: uname, display_name: dname } as never).eq("id", u.id);
        if (pErr) { setBusy(false); return toast.error(/duplicate|unique/i.test(pErr.message) ? "That username is already taken." : pErr.message); }
      }
    }
    try {
      await completeChange({ data: { password, currentPassword, recovery, ...(needsProfile ? { profile: { username: uname, displayName: dname } } : {}) } });
    } catch (error) {
      setBusy(false);
      return toast.error(error instanceof Error ? error.message : "Couldn't update your password.");
    }
    setBusy(false);
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/home" });
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-2 bg-background">
      <aside className="relative hidden lg:flex items-center justify-center overflow-hidden bg-gradient-to-br from-blue-700/40 via-cyan-600/30 to-violet-700/40 border-r border-border">
        <div className="absolute -top-32 -left-24 size-[28rem] rounded-full bg-blue-600/30 blur-3xl" />
        <div className="absolute -bottom-32 -right-24 size-[28rem] rounded-full bg-violet-600/30 blur-3xl" />
        <div className="absolute top-1/3 right-10 size-72 rounded-full bg-cyan-500/20 blur-3xl" />
        <div className="relative z-10 flex max-h-full max-w-lg flex-col items-center justify-center px-10 py-6 text-center">
          <img
            src={resetIllustration}
            alt="Illustration of a person resetting their forgotten password on a computer"
            width={1024}
            height={1024}
            loading="lazy"
            className="h-auto max-h-[45vh] w-auto max-w-full drop-shadow-[0_25px_60px_rgba(59,130,246,0.45)]"
          />
          <h2 className="font-display text-2xl font-bold mt-4 text-foreground">
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
            <p className="text-sm text-muted-foreground mb-6">
              {needsProfile
                ? "Choose your username, display name and password to finish setting up your account."
                : forced
                ? "A password change is required for your account. Choose a different password to continue."
                : "Enter your new password below."}
            </p>
            <form onSubmit={submit} className="space-y-3">
              {needsProfile && (
                <>
                  <Field label="Username" value={username} onChange={setUsername} />
                  <Field label="Display name" value={displayName} onChange={setDisplayName} />
                </>
              )}
              {!recovery && <Field label="Current password" type="password" value={currentPassword} onChange={setCurrentPassword} />}
              <Field label="New password" type="password" value={password} onChange={setPassword} />
              <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} />
              <Button disabled={busy} className="w-full h-11">
                {busy ? "Updating…" : "Update password"}
              </Button>
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
import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthFrame, Field } from "./login";

export const Route = createFileRoute("/signup")({
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) throw redirect({ to: "/home" });
  },
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: displayName, username: displayName.toLowerCase().replace(/\s+/g, "") },
      },
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. A moderator will review your request.");
    navigate({ to: "/gate" });
  };

  return (
    <AuthFrame title="Request access" subtitle="A moderator will review your request before you get in.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Display name" value={displayName} onChange={setDisplayName} />
        <Field label="Email" type="email" value={email} onChange={setEmail} />
        <Field label="Password" type="password" value={password} onChange={setPassword} />
        <button disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50">
          {busy ? "Creating…" : "Request access"}
        </button>
      </form>
      <div className="text-sm text-muted-foreground text-center mt-6">
        Already in?{" "}
        <Link to="/login" className="text-primary hover:underline">Sign in</Link>
      </div>
    </AuthFrame>
  );
}

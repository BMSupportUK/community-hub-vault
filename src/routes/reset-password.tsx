import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthFrame, Field } from "./login";

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
    <AuthFrame title="Set a new password" subtitle="Enter your new password below.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password" type="password" value={password} onChange={setPassword} />
        <Field label="Confirm password" type="password" value={confirm} onChange={setConfirm} />
        <button disabled={busy} className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-medium shadow-glow hover:opacity-90 disabled:opacity-50">
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthFrame>
  );
}
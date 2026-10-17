import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { resetUserMfa } from "@/lib/mfa.functions";
import { sendTemporaryPassword } from "@/lib/temp-password.functions";

/** Admin dashboard (Members & Role Management) only: Reset 2FA + Email new password. */
export function MemberSecurityActions({ userId, name }: { userId: string; name: string }) {
  const resetMfa = useServerFn(resetUserMfa);
  const sendTempPw = useServerFn(sendTemporaryPassword);
  const [open, setOpen] = useState<null | "mfa" | "pw">(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      if (open === "mfa") {
        const res = await resetMfa({ data: { userId, reason: reason.trim() || undefined } });
        toast.success(res.removed > 0 ? `Removed ${res.removed} factor(s)` : "No 2FA factors to remove");
      } else {
        await sendTempPw({ data: { userId } });
        toast.success("New password emailed. They'll be asked to change it when they sign in.");
      }
      setOpen(null);
      setReason("");
    } catch (e: any) {
      toast.error(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const btn = "inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-surface-2 border border-border transition";
  return (
    <>
      <div className="flex flex-wrap gap-2 pt-3">
        <button onClick={() => setOpen("mfa")} className={`${btn} hover:border-destructive hover:text-destructive`}>
          <ShieldOff className="size-3.5" /> Reset 2FA
        </button>
        <button onClick={() => setOpen("pw")} className={`${btn} hover:border-primary hover:text-primary`}>
          <KeyRound className="size-3.5" /> Email new password
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 grid place-items-center p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-border p-6 space-y-4">
            <div>
              <h2 className="font-display font-semibold text-lg">{open === "mfa" ? "Reset 2FA" : "Email a new password"}</h2>
              <p className="text-xs text-muted-foreground">for {name}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {open === "mfa"
                ? "This removes every authenticator factor on the account. They'll be able to sign in with just their password and should re-enable 2FA right away."
                : "Their current password stops working straight away. They'll get an email with a new temporary password and must choose their own as soon as they sign in."}
            </p>
            {open === "mfa" && (
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Reason (optional), e.g. Lost phone, verified via ticket #123"
                className="w-full px-3 py-2 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm"
              />
            )}
            <div className="flex gap-2">
              <button onClick={run} disabled={busy} className={`flex-1 h-11 rounded-lg font-medium disabled:opacity-50 ${open === "mfa" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
                {busy ? "Working…" : open === "mfa" ? "Reset 2FA" : "Send new password"}
              </button>
              <button onClick={() => { setOpen(null); setReason(""); }} disabled={busy} className="px-4 h-11 rounded-lg bg-surface-2 border border-border text-sm">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

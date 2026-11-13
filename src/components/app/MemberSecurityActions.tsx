import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { resetUserMfa } from "@/lib/mfa.functions";
import { createUserManually, requestCustomerPasswordReset } from "@/lib/temp-password.functions";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Admin dashboard (Members & Role Management) only: Reset 2FA + Email new password. */
export function MemberSecurityActions({ userId, name }: { userId: string; name: string }) {
  const resetMfa = useServerFn(resetUserMfa);
  const sendReset = useServerFn(requestCustomerPasswordReset);
  const { hasAny } = useAuth();
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
        await sendReset({ data: { userId } });
        toast.success("Reset request emailed. They must confirm their chosen password after signing in.");
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
        {hasAny(["admin"]) && <Button variant="outline" size="sm" onClick={() => setOpen("pw")}>
          <KeyRound className="size-3.5" /> Request password reset
        </Button>}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 grid place-items-center p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-border p-6 space-y-4">
            <div>
              <h2 className="font-display font-semibold text-lg">{open === "mfa" ? "Reset 2FA" : "Request a password reset"}</h2>
              <p className="text-xs text-muted-foreground">for {name}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              {open === "mfa"
                ? "This removes every authenticator factor on the account. They'll be able to sign in with just their password and should re-enable 2FA right away."
                : "They'll receive a reset email with a secure link. They must confirm their chosen password before continuing after their next sign-in, and can keep their existing password. No password is emailed."}
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
              <Button onClick={run} disabled={busy} variant={open === "mfa" ? "destructive" : "default"} className="flex-1 h-11">
                {busy ? "Working…" : open === "mfa" ? "Reset 2FA" : "Send reset request"}
              </Button>
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

/** Admin/management: add a manual contact without creating a website account. */
export function AddUserButton({ onCreated }: { onCreated?: () => void }) {
  const create = useServerFn(createUserManually);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [existingCustomer, setExistingCustomer] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Enter the customer name.");
      return;
    }
    setBusy(true);
    try {
      await create({ data: { email: email.trim(), name: name.trim(), existingCustomer, expiryDate: existingCustomer ? expiryDate : "" } });
      toast.success("Manual customer added. No website account created or email sent.");
      window.dispatchEvent(new Event("bm-customer-list-changed"));
      setOpen(false); setEmail(""); setName(""); setExistingCustomer(false); setExpiryDate("");
      onCreated?.();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't create the account");
    } finally {
      setBusy(false);
    }
  };
  const input = "w-full h-10 px-3 rounded-lg bg-input border border-border focus:outline-none focus:ring-2 focus:ring-ring text-sm";
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus className="size-4" /> Add customer
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-background/80 grid place-items-center p-4">
          <form onSubmit={submit} className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-border p-6 space-y-3">
            <h2 className="font-display font-semibold text-lg">Add a manual customer</h2>
            <p className="text-sm text-muted-foreground">The customer creates their own website account at the end of secure checkout.</p>
            <label className="block text-xs font-medium text-muted-foreground">Name
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Customer name" className={input} />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">Email (optional)
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm" htmlFor="manual-existing-customer">
              <Checkbox id="manual-existing-customer" checked={existingCustomer} onCheckedChange={(checked) => setExistingCustomer(checked === true)} />
              Existing customer
            </label>
            {existingCustomer && <label className="block text-xs font-medium text-muted-foreground">Subscription expiry (optional)
              <input aria-label="Subscription expiry" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={input} />
            </label>}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={busy} className="flex-1 h-11">
                {busy ? "Adding…" : "Add to customer list"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LogIn, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canSwitchCustomerAccount } from "@/lib/customer-account-access";
import { startCustomerAccountSwitch, returnToAdminAccount, customerAccountSwitchStatus } from "@/lib/customer-account-switch.functions";

export function CustomerAccountSwitchButton({ customerId, name }: { customerId: string; name: string }) {
  const { roles, user } = useAuth();
  const startSwitch = useServerFn(startCustomerAccountSwitch);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkingMfa, setCheckingMfa] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setCheckingMfa(true);
    setMfaCode("");
    setError("");
    void supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error: assuranceError }) => {
      if (!active) return;
      if (assuranceError) setError("Unable to check your admin verification. Close this window and try again.");
      else setNeedsMfa(data?.nextLevel === "aal2" && data.currentLevel !== "aal2");
    }).catch(() => {
      if (active) setError("Unable to check your admin verification. Close this window and try again.");
    }).finally(() => { if (active) setCheckingMfa(false); });
    return () => { active = false; };
  }, [open]);
  if (!canSwitchCustomerAccount(roles) || user?.id === customerId) return null;
  const enter = async () => {
    if (busy || checkingMfa || (needsMfa && mfaCode.length !== 6)) return;
    setBusy(true);
    setError("");
    try {
      if (needsMfa) {
        const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
        if (factorError) throw new Error("Unable to check your admin authenticator. Try again.");
        const factor = factors?.totp.find((item) => item.status === "verified");
        if (!factor) throw new Error("No verified authenticator was found on your admin account.");
        const { error: verificationError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: mfaCode });
        if (verificationError) throw new Error("That code was not accepted. Enter the newest code from your admin authenticator.");
        setNeedsMfa(false);
        setMfaCode("");
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const { tokenHash } = await startSwitch({ data: { customerId, accessToken: session.access_token, refreshToken: session.refresh_token } });
      window.dispatchEvent(new Event("bm-customer-switch-status"));
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) throw error;
      window.location.assign("/home");
    } catch (error) { setError(error instanceof Error ? error.message : "Unable to switch account"); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="ghost" size="icon" title={`Log in as ${name}`} aria-label={`Log in as ${name}`} onClick={() => setOpen(true)}><LogIn className="size-4" /></Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Log in as {name}?</DialogTitle></DialogHeader><form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void enter(); }}><p className="text-sm text-muted-foreground">You will have this customer's access. Changes you make will affect their account. This switch is recorded.</p>{checkingMfa && <p role="status" className="text-sm text-muted-foreground">Checking your admin verification…</p>}{!checkingMfa && needsMfa && <div className="space-y-2"><label htmlFor={`customer-switch-mfa-${customerId}`} className="text-sm font-semibold">Your admin two-factor code</label><Input id={`customer-switch-mfa-${customerId}`} autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit authenticator code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, ""))} disabled={busy} /><p className="text-sm text-muted-foreground">Use your admin authenticator, not the customer's.</p></div>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || checkingMfa || (needsMfa && mfaCode.length !== 6)}>{busy ? <Loader2 className="animate-spin" /> : <LogIn />}Log in as customer</Button></DialogFooter></form></DialogContent></Dialog>
  </>;
}

export function CustomerAccountReturnBanner() {
  const { user } = useAuth();
  const getStatus = useServerFn(customerAccountSwitchStatus);
  const returnAccount = useServerFn(returnToAdminAccount);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const refresh = () => { void getStatus().then((result) => setActive(result.active)).catch(() => {}); };
    refresh();
    window.addEventListener("bm-customer-switch-status", refresh);
    return () => window.removeEventListener("bm-customer-switch-status", refresh);
  }, [user?.id]);
  if (!active) return null;
  const restore = async () => {
    setBusy(true);
    try {
      const session = await returnAccount();
      const { error } = await supabase.auth.setSession(session);
      if (error) throw error;
      window.location.assign("/admin?tab=customers");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to return to admin"); setBusy(false); }
  };
  return <div role="status" className="fixed bottom-3 left-3 z-[2147483001] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center gap-3 rounded-lg border border-warning bg-background px-4 py-3 shadow-lg"><span className="text-sm font-medium">Customer account session</span><Button variant="outline" size="sm" disabled={busy} onClick={() => void restore()}>{busy ? <Loader2 className="animate-spin" /> : <Undo2 />}Return to admin</Button></div>;
}
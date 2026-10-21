import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LogIn, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  if (!canSwitchCustomerAccount(roles) || user?.id === customerId) return null;
  const enter = async () => {
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Please sign in again.");
      const { tokenHash } = await startSwitch({ data: { customerId, accessToken: session.access_token, refreshToken: session.refresh_token } });
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) throw error;
      window.location.assign("/home");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Unable to switch account"); }
    finally { setBusy(false); }
  };
  return <>
    <Button variant="ghost" size="icon" title={`Log in as ${name}`} aria-label={`Log in as ${name}`} onClick={() => setOpen(true)}><LogIn className="size-4" /></Button>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Log in as {name}?</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">You will have this customer's access. Changes you make will affect their account. This switch is recorded.</p><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy} onClick={() => void enter()}>{busy ? <Loader2 className="animate-spin" /> : <LogIn />}Log in as customer</Button></DialogFooter></DialogContent></Dialog>
  </>;
}

export function CustomerAccountReturnBanner() {
  const { user } = useAuth();
  const getStatus = useServerFn(customerAccountSwitchStatus);
  const returnAccount = useServerFn(returnToAdminAccount);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void getStatus().then((result) => setActive(result.active)).catch(() => {}); }, [user?.id]);
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
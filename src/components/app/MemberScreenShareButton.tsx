import { useState } from "react";
import { Loader2, MonitorUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsDemoAccount } from "@/hooks/use-demo-account";
import { canUseTvRemote, normalizePairCode } from "@/lib/tv-remote";
import type { Live } from "@/components/tv/TvRemote";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function MemberScreenShareButton({ name, disabled, onPaired }: {
  name: string;
  disabled: boolean;
  onPaired: (live: Live, name: string) => void;
}) {
  const { roles, user } = useAuth();
  const demo = useIsDemoAccount();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Member-list screen sharing is admin only; other staff roles never see it.
  if (!user || demo || !canUseTvRemote(roles) || !roles.includes("admin")) return null;

  return <>
    <TooltipProvider><Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="icon" disabled={disabled}
          aria-label={`Screen share with ${name}`} className="size-8 shrink-0 text-primary"
          onClick={() => { setCode(""); setError(null); setOpen(true); }}>
          <MonitorUp className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Screen share</TooltipContent>
    </Tooltip></TooltipProvider>
    <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Screen share with {name}</DialogTitle>
          <DialogDescription>Enter the six-digit code shown in BM Remote Helper on the customer's TV.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={async (event) => {
          event.preventDefault();
          if (busy || code.length !== 6) return;
          setBusy(true); setError(null);
          try {
            const { data, error: pairingError } = await supabase.rpc("claim_tv_pair_code", { _code: code, _customer: name });
            const row = data?.[0];
            if (pairingError || !row) { setError(pairingError?.message ?? "That code is wrong or has expired."); return; }
            setOpen(false); setCode("");
            onPaired({ id: row.id, topic: row.topic, device: row.device_name, host: true, linkKind: null, linkId: null, hostId: user.id }, name);
          } catch { setError("Could not connect to the TV. Try again."); }
          finally { setBusy(false); }
        }}>
          <label className="block space-y-2">
            <span className="text-sm font-medium">TV code</span>
            <Input aria-label="TV code" inputMode="numeric" autoComplete="off" autoFocus
              value={code} disabled={busy} onChange={(event) => setCode(normalizePairCode(event.target.value))}
              placeholder="123456" className="h-12 text-center font-mono text-2xl" />
          </label>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <MonitorUp className="size-4" />}
            {busy ? "Connecting…" : "Connect TV"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  </>;
}
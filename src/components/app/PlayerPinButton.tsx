import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmPlayerTotp, getMyPlayerUnlock, startPlayerTotp } from "@/lib/player-pin.functions";

/** BM Player 2FA status in the subscription box, with set up for customers who haven't done it on the box yet. */
export function PlayerPinButton({ className }: { className?: string }) {
  const unlockFn = useServerFn(getMyPlayerUnlock);
  const startFn = useServerFn(startPlayerTotp);
  const confirmFn = useServerFn(confirmPlayerTotp);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<"none" | "totp">("none");
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => { unlockFn().then((r) => setMethod(r.method)).catch(() => {}); }, [unlockFn]);

  const beginTotp = async () => {
    setBusy(true); setError("");
    try { setSetup(await startFn()); setCode(""); } catch { setError("Couldn't start set up. Try again."); } finally { setBusy(false); }
  };
  const finishTotp = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const r = await confirmFn({ data: { code } });
      if (!r.ok) { setError(r.error); return; }
      setMethod("totp"); setSetup(null);
      toast.success("2FA is on. Your 10 backup codes are in Security settings.");
    } catch { setError("Couldn't check that code. Try again."); } finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" className={className} onClick={() => { setError(""); setOpen(true); }}>
        {method === "totp" ? "Player 2FA: on · Backup codes" : "Player 2FA: not set up · Set up now"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>BM Player 2FA</DialogTitle>
            <DialogDescription>BM Player asks for the 6-digit code from your authenticator app once a day. If you can't get to the app, use one of your 10 backup codes instead.</DialogDescription>
          </DialogHeader>
          {method === "none" && !setup && <Button type="button" className="w-full" disabled={busy} onClick={() => void beginTotp()}>Set up authenticator app</Button>}
          {setup && <form onSubmit={finishTotp} className="space-y-3">
            <p className="text-sm text-muted-foreground">Scan this with Google Authenticator, Microsoft Authenticator or similar, then type the 6-digit code it shows.</p>
            <div className="mx-auto w-fit rounded-md bg-card p-2 [&_svg]:size-44" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
            <p className="break-all text-center font-mono text-xs text-muted-foreground">Or type this key: {setup.secret}</p>
            <Input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Turn on authenticator"}</Button>
          </form>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {method === "totp" && <div className="space-y-3">
            <p className="text-sm text-muted-foreground">2FA is on. Your 10 backup codes are kept in Security settings, locked until you confirm your account password.</p>
            <Button asChild className="w-full"><Link to="/account-security" onClick={() => setOpen(false)}>View backup codes</Link></Button>
          </div>}
        </DialogContent>
      </Dialog>
    </>
  );
}

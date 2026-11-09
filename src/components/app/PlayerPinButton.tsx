import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmPlayerTotp, disablePlayerTotp, getMyPlayerPin, getMyPlayerUnlock, setMyPlayerPin, startPlayerTotp } from "@/lib/player-pin.functions";

/** Lets a customer set or change the 4-digit PIN BM Player asks for after its opening video. */
export function PlayerPinButton({ className }: { className?: string }) {
  const status = useServerFn(getMyPlayerPin);
  const save = useServerFn(setMyPlayerPin);
  const [isSet, setIsSet] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const unlockFn = useServerFn(getMyPlayerUnlock);
  const startFn = useServerFn(startPlayerTotp);
  const confirmFn = useServerFn(confirmPlayerTotp);
  const offFn = useServerFn(disablePlayerTotp);
  const [method, setMethod] = useState<"pin" | "totp">("pin");
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => { status().then((r) => setIsSet(r.set)).catch(() => setIsSet(null)); }, [status]);
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
      setMethod("totp"); setSetup(null); setOpen(false);
      toast.success("Authenticator turned on. BM Player will ask for a code once a day instead of your PIN.");
    } catch { setError("Couldn't check that code. Try again."); } finally { setBusy(false); }
  };
  const usePin = async () => {
    setBusy(true); setError("");
    try { await offFn(); setMethod("pin"); setSetup(null); toast.success("BM Player will ask for your 4-digit PIN again."); }
    catch { setError("Couldn't switch back. Try again."); } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin !== again) { setError("The two PINs don't match."); return; }
    setBusy(true); setError("");
    try {
      const r = await save({ data: { pin } });
      if (!r.ok) { setError(r.error); return; }
      toast.success("BM Player PIN saved. Your boxes will ask for it next time they open.");
      setIsSet(true); setOpen(false); setPin(""); setAgain("");
    } catch { setError("Couldn't save your PIN. Try again."); }
    finally { setBusy(false); }
  };

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  return (
    <>
      <button type="button" className={className} onClick={() => { setError(""); setOpen(true); }}>
        {method === "totp" ? "Player unlock: authenticator · Change" : isSet ? "Player PIN: set · Change" : "Player PIN: not set · Set"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>How BM Player unlocks</DialogTitle>
            <DialogDescription>Choose a 4-digit PIN (asked every time the app opens) or an authenticator app code (asked once a day). It works on all your boxes.</DialogDescription>
          </DialogHeader>
          <div role="radiogroup" aria-label="Unlock with" className="grid grid-cols-2 gap-2">
            <Button type="button" role="radio" aria-checked={method === "pin" && !setup} variant={method === "pin" && !setup ? "default" : "outline"} disabled={busy} onClick={() => (method === "totp" ? void usePin() : setSetup(null))}>4-digit PIN</Button>
            <Button type="button" role="radio" aria-checked={method === "totp" || !!setup} variant={method === "totp" || setup ? "default" : "outline"} disabled={busy || method === "totp"} onClick={() => void beginTotp()}>Authenticator</Button>
          </div>
          {setup ? <form onSubmit={finishTotp} className="space-y-3">
            <p className="text-sm text-muted-foreground">Scan this with Google Authenticator, Microsoft Authenticator or similar, then type the 6-digit code it shows.</p>
            <div className="mx-auto w-fit rounded-md bg-card p-2 [&_svg]:size-44" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
            <p className="break-all text-center font-mono text-xs text-muted-foreground">Or type this key: {setup.secret}</p>
            <Input aria-label="6-digit code" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Turn on authenticator"}</Button>
          </form> : method === "totp" ? <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Authenticator is on. Your boxes ask for the 6-digit BM Player code once a day. Tap "4-digit PIN" to switch back.</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div> : <form onSubmit={submit} className="space-y-3">
            <Input aria-label="New PIN" type="password" inputMode="numeric" autoComplete="new-password" placeholder="New PIN" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
            <Input aria-label="Repeat PIN" type="password" inputMode="numeric" autoComplete="new-password" placeholder="Repeat PIN" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || pin.length !== 4 || again.length !== 4}>{busy ? "Saving…" : "Save PIN"}</Button>
          </form>}
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMyPlayerPin, setMyPlayerPin } from "@/lib/player-pin.functions";

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

  useEffect(() => { status().then((r) => setIsSet(r.set)).catch(() => setIsSet(null)); }, [status]);

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
        {isSet ? "Change player PIN" : "Set player PIN"}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isSet ? "Change BM Player PIN" : "Set a BM Player PIN"}</DialogTitle>
            <DialogDescription>BM Player asks for this 4-digit PIN after the opening video, before the main menu. It works on all your boxes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <Input aria-label="New PIN" type="password" inputMode="numeric" autoComplete="new-password" placeholder="New PIN" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
            <Input aria-label="Repeat PIN" type="password" inputMode="numeric" autoComplete="new-password" placeholder="Repeat PIN" value={again} onChange={(e) => setAgain(digits(e.target.value))} />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || pin.length !== 4 || again.length !== 4}>{busy ? "Saving…" : "Save PIN"}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

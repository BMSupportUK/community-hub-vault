import { useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listMyBoxes, sendAccountNumberToBox } from "@/lib/send-to-box.functions";

type Box = { id: string; name: string; type: string; on: boolean };

/** Click the account number to unlock BM Player on the customer's device; picks a device when there are several. */
export function SendAccountNumber({ className, children }: { className?: string; children: ReactNode }) {
  const list = useServerFn(listMyBoxes);
  const send = useServerFn(sendAccountNumberToBox);
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const sendTo = async (b: Box) => {
    setBusy(true);
    try {
      const r = await send({ data: { deviceId: b.id } });
      if (r.ok) { toast.success(`Account number sent to ${b.name}`); setOpen(false); }
      else toast.error(r.error);
    } catch { toast.error("Could not send to your device. Please try again."); }
    finally { setBusy(false); }
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    let found: Box[] = [];
    try { found = await list(); } catch { /* handled below */ }
    setBusy(false);
    setBoxes(found);
    if (found.length === 0) { toast.error("No BM Player devices are linked to your account yet."); return; }
    if (found.length === 1) { void sendTo(found[0]); return; }
    setOpen(true);
  };

  return (
    <>
      <button type="button" onClick={start} disabled={busy} title="Send account number to my device" className={className}>
        {children}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Send account number</DialogTitle>
            <DialogDescription>Choose which device to unlock. BM Player must be open on it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(boxes ?? []).map((b) => (
              <Button key={b.id} variant="outline" className="w-full justify-between" disabled={busy || !b.on} onClick={() => sendTo(b)}>
                <span className="truncate">{b.name} · {b.type}</span>
                <span className={b.on ? "text-primary" : "text-muted-foreground"}>{b.on ? "On" : "Off"}</span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MonitorUp, CheckCircle2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { requestCheckoutScreenShare, getCheckoutScreenShareStatus } from "@/lib/tv-help.functions";
import { screenShareInProgress, orderScreenShareAllowed } from "@/lib/tv-remote";

/** Customer: ask staff to see the TV screen through BM Remote Helper. */
export function CheckoutScreenShare({ token, password }: { token: string; password: string }) {
  const send = useServerFn(requestCheckoutScreenShare);
  const [invited, setInvited] = useState(false);
  const [open, setOpen] = useState(false);
  const wasInvited = useRef(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [live, setLive] = useState<string | null>(null);
  const wasOngoing = useRef(false);
  const check = useServerFn(getCheckoutScreenShareStatus);
  useEffect(() => {
    let stop = false;
    const load = () => check({ data: { token, password } }).then((r) => {
      if (stop) return;
      const ongoing = screenShareInProgress(r.status);
      setInvited(r.invited);
      // Pop the TV-code box once when staff ask, like support tickets.
      if (r.invited && !wasInvited.current && !ongoing) setOpen(true);
      wasInvited.current = r.invited;
      setLive(ongoing ? r.status : null);
      setDone(ongoing);
      // When a share ends the code box comes straight back for another entry.
      if (!ongoing && wasOngoing.current) { setCode(""); setErr(null); setOpen(true); }
      wasOngoing.current = ongoing;
    }).catch(() => {});
    load();
    const t = window.setInterval(load, 2000);
    return () => { stop = true; window.clearInterval(t); };
  }, [token, password, check]);

  if (!orderScreenShareAllowed(invited, live)) return null;
  if (done) return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/10 p-4 text-sm">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />
      <p>{live && live !== "pending" ? <>Staff are connected to your TV. You can keep using your order page — the screen share carries on.</> : <>Staff have been alerted. When they connect, press <strong>Allow</strong> and then <strong>Start</strong> on your TV.</>}</p>
    </div>
  );
  return (<>
    <Button type="button" className="h-11 w-full" onClick={() => setOpen(true)}>
      <MonitorUp className="mr-2 size-4" /> Share my TV screen
    </Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enter your TV code</DialogTitle><DialogDescription>BM Support has requested to see your TV screen.</DialogDescription></DialogHeader>
    <form className="space-y-3 rounded-xl border p-4" onSubmit={async (e) => {
      e.preventDefault();
      if (code.length !== 6) return;
      setBusy(true); setErr(null);
      try {
        const r = await send({ data: { token, password, code } });
        if (r.ok) { wasOngoing.current = true; setLive("pending"); setDone(true); setCode(""); setOpen(false); } else setErr(r.error);
      } catch { setErr("Something went wrong. Try again."); }
      finally { setBusy(false); }
    }}>
      <p className="flex items-center gap-2 text-sm font-semibold"><MonitorUp className="size-4 text-primary" />Staff have asked to see your TV screen</p>
      <p className="text-sm">Open <strong>BM Remote Helper</strong> on your TV and type the 6-digit code it shows.</p>
      <Input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="123456" className="h-12 text-center font-mono text-2xl tracking-[0.4em]" autoFocus />
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Connect TV"}
      </Button>
    </form>
      </DialogContent>
    </Dialog>
  </>);
}

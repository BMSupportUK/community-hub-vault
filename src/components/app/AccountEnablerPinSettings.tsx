import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createAccountEnablerPin, resetAccountEnablerPin } from "@/lib/enabler-pin.functions";

type Pin = { pin: string; expires_at: string };
const fmt = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; };

/** Settings: the customer's own BM TV Enabler PIN, renewed automatically every 24 hours, with a reset. */
export function AccountEnablerPinSettings() {
  const getFn = useServerFn(createAccountEnablerPin), resetFn = useServerFn(resetAccountEnablerPin);
  const [pin, setPin] = useState<Pin | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [now, setNow] = useState(Date.now());
  const load = async () => { try { setPin(await getFn()); setErr(null); } catch (e) { setErr(e instanceof Error ? e.message : "Couldn't load your PIN"); } };
  useEffect(() => {
    void load();
    const sync = () => { void load(); };
    window.addEventListener("focus", sync);
    window.addEventListener("enabler-pin-changed", sync);
    const t = window.setInterval(() => { setNow(Date.now()); void load(); }, 30000);
    return () => { window.clearInterval(t); window.removeEventListener("focus", sync); window.removeEventListener("enabler-pin-changed", sync); };
  }, []);
  useEffect(() => { if (pin && new Date(pin.expires_at).getTime() <= now) void load(); }, [now, pin]);
  const reset = async () => {
    setBusy(true);
    try { setPin(await resetFn()); setConfirm(false); window.dispatchEvent(new Event("enabler-pin-changed")); toast.success("New BM TV Enabler PIN issued"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't reset your PIN"); }
    setBusy(false);
  };
  const left = pin ? new Date(pin.expires_at).getTime() - now : 0;
  return <section className="max-w-md space-y-3 rounded-xl border border-border bg-surface-1 p-4">
    <h2 className="flex items-center gap-2 font-display text-sm font-semibold"><KeyRound className="size-4" />BM TV Enabler PIN</h2>
    <p className="text-xs text-muted-foreground">BM TV Enabler asks for this PIN each time you open it. It's yours only and changes automatically every 24 hours.</p>
    {err ? <p className="text-sm text-destructive">{err}</p> : !pin ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <>
      <p className="text-center font-mono text-3xl font-bold tracking-[0.3em]">{pin.pin}</p>
      <p className={`text-center text-xs ${left < 3600_000 ? "text-destructive" : "text-muted-foreground"}`}>Changes in {fmt(left)}</p>
    </>}
    {confirm ? <div className="space-y-2 rounded-md border border-destructive/40 p-3">
      <p className="text-xs">This can't be undone. Your current PIN stops working straight away and the new PIN takes over.</p>
      <div className="flex gap-2"><Button size="sm" variant="destructive" disabled={busy} onClick={() => void reset()}>Confirm reset</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>Cancel</Button></div>
    </div> : <Button variant="outline" className="w-full" disabled={!pin} onClick={() => setConfirm(true)}><RotateCcw className="size-4" />Reset PIN</Button>}
  </section>;
}

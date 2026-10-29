import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Pin = { pin: string; expires_at: string };
const fmt = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}h ${m % 60}m`; };

/**
 * Customer: get (and re-show) the 24-hour PIN that logs BM TV Enabler in. Staff: see only whether
 * one is active and when it ends. Owners can restore the same PIN after reopening the page.
 */
export function EnablerPinBox({ scopeKey, staff, create, status, reveal }: {
  scopeKey: string; staff?: boolean; reveal?: () => Promise<Pin>;
   create?: () => Promise<Pin>; status: () => Promise<{ expires_at: string | null; pin?: string }>;
}) {
  const key = `enabler-pin:${scopeKey}`;
  const [pin, setPin] = useState<Pin | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    try {
      const s = await status(); setActive(s.expires_at);
      if (!s.expires_at) { setPin(null); localStorage.removeItem(key); }
      else if (!staff && s.pin) {
        const p = { pin: s.pin, expires_at: s.expires_at }; setPin(p);
        localStorage.setItem(key, JSON.stringify(p));
      }
      setChecked(true);
    } catch { /* fail closed: don't issue a replacement if status is unknown */ }
  }, [status, key, staff]);
  useEffect(() => {
    setPin(null); setActive(null); setChecked(false); setRevealed(false);
    if (!staff) { try { const p = JSON.parse(localStorage.getItem(key) ?? "null") as Pin | null; if (p && new Date(p.expires_at).getTime() > Date.now()) setPin(p); } catch { /* ignore */ } }
    void refresh();
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    const sync = () => { void refresh(); };
    window.addEventListener("focus", sync);
    window.addEventListener("enabler-pin-changed", sync);
    const poll = window.setInterval(sync, 30000);
    return () => { window.clearInterval(t); window.clearInterval(poll); window.removeEventListener("focus", sync); window.removeEventListener("enabler-pin-changed", sync); };
  }, [key, staff, refresh]);
  const make = async () => {
    if (!create || !checked || (active && new Date(active).getTime() > Date.now())) return;
    setBusy(true);
    try { const p = await create(); setPin(p); setActive(p.expires_at); localStorage.setItem(key, JSON.stringify(p)); window.dispatchEvent(new Event("enabler-pin-changed")); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't get a PIN"); }
    setBusy(false);
  };
  const doReveal = async () => {
    if (!reveal) return;
    setBusy(true);
    try { const p = await reveal(); setPin(p); setActive(p.expires_at); setRevealed(true); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't reveal the PIN"); }
    setBusy(false);
  };
  const left = active ? new Date(active).getTime() - now : 0;
  const live = left > 0;
  if (staff) return <div className="rounded-xl border border-border bg-card p-3 text-sm text-foreground">
    <p className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" />BM TV Enabler PIN</p>
    <p className="text-muted-foreground">{live ? `Active — ends in ${fmt(left)}` : "No active PIN. The customer can get one from their Remote setup tab."}</p>
  </div>;
  const shown = pin && live && pin.expires_at === active ? pin : null;
  return <div className="space-y-2 rounded-xl border border-primary/40 bg-card p-4 text-left text-foreground">
    <h3 className="flex items-center gap-2 font-semibold"><KeyRound className="size-4" />BM TV Enabler PIN</h3>
    <p className="text-sm text-muted-foreground">BM TV Enabler asks for this PIN when it opens. It lasts 24 hours.</p>
    {shown && (revealed || !reveal) ? <>
      <p className="text-center font-mono text-3xl font-bold tracking-[0.3em]">{shown.pin}</p>
      <p className={`text-center text-xs ${left < 3600_000 ? "text-destructive" : "text-muted-foreground"}`}>Valid for {fmt(left)}</p>
    </> : <>
      {live && reveal ? <>
        <p className="text-center font-mono text-3xl font-bold tracking-[0.3em] text-muted-foreground">••••••</p>
        <p className="text-center text-xs text-muted-foreground">Valid for {fmt(left)}</p>
        <Button className="w-full" variant="outline" disabled={busy} onClick={() => void doReveal()}>Reveal PIN</Button>
      </> : live ? <p className="text-xs text-muted-foreground">Your existing PIN is valid for {fmt(left)}. For PINs issued before this update, use the device where you requested it. A new PIN is available after expiry.</p>
        : <Button className="w-full" disabled={busy || !checked} onClick={() => void make()}>{checked ? "Get BM TV Enabler PIN" : "Checking PIN…"}</Button>}
    </>}
  </div>;
}

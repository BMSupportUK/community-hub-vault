import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockPlayerAdminWithPin } from "@/lib/staff-pin.functions";
import { clearUnlock, isStillUnlocked, markUnlocked, unlockedUntil } from "@/lib/player-admin-unlock";

/** Login screen for the BM Player Admin Dashboard: Staff PIN, locks after 10 minutes without activity. */
export function PlayerAdminGate({ children }: { children: ReactNode }) {
  const unlock = useServerFn(unlockPlayerAdminWithPin);
  const [until, setUntil] = useState(0), [now, setNow] = useState(Date.now());
  const [pin, setPin] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { setUntil(unlockedUntil()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const open = isStillUnlocked(until, now);
  useEffect(() => { if (until && !open) clearUnlock(); }, [open, until]);
  useEffect(() => {
    if (!open) return;
    let last = 0;
    const bump = () => { const t = Date.now(); if (t - last > 5000) { last = t; setUntil(markUnlocked(t)); } };
    const evs = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove", "scroll"];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true, capture: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, bump, { capture: true }));
  }, [open]);

  if (open) {
    return <>{children}</>;
  }

  return <main className="flex min-h-0 flex-1 items-center justify-center bg-background px-4 py-10">
    <form className="w-full max-w-xl space-y-4 rounded-2xl border border-border bg-surface p-6" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        const r = await unlock({ data: { pin } });
        if (r.ok) { setUntil(markUnlocked()); setPin(""); } else setError(r.error ?? "Incorrect staff PIN");
      } catch { setError("Couldn't check your PIN. Try again."); } finally { setBusy(false); }
    }}>
      <div className="flex items-baseline gap-x-3">
        <div className="flex shrink-0 items-center gap-2"><KeyRound className="size-5 shrink-0 text-primary" /><h1 className="font-display text-xl font-bold">BM Player Admin login</h1></div>
        <p className="whitespace-nowrap text-sm text-muted-foreground">Staff PIN · locks after 10 minutes idle.</p>
      </div>
      <Input type="password" inputMode="numeric" autoComplete="off" autoFocus aria-label="Staff PIN" placeholder="Staff PIN" value={pin} onChange={(e) => setPin(e.target.value)} aria-invalid={!!error} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || !pin.trim()}>{busy ? <Loader2 className="animate-spin" /> : null}Log in</Button>
      <Link to="/staff-pin" className="block text-center text-xs text-muted-foreground hover:text-foreground">Forgotten your Staff PIN?</Link>
    </form>
  </main>;
}

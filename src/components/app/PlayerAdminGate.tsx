import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { KeyRound, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { unlockPlayerAdminWithPin } from "@/lib/staff-pin.functions";
import { clearUnlock, isStillUnlocked, markUnlocked, unlockedUntil } from "@/lib/player-admin-unlock";

/** Login screen for the BM Player Admin Dashboard: Staff PIN, then 15 minutes of access. */
export function PlayerAdminGate({ children }: { children: ReactNode }) {
  const unlock = useServerFn(unlockPlayerAdminWithPin);
  const [until, setUntil] = useState(0), [now, setNow] = useState(Date.now());
  const [pin, setPin] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { setUntil(unlockedUntil()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const open = isStillUnlocked(until, now);
  useEffect(() => { if (until && !open) clearUnlock(); }, [open, until]);

  if (open) {
    const left = Math.max(0, Math.ceil((until - now) / 1000));
    return <>
      <div className="flex items-center justify-end gap-2 px-4 pt-3 text-xs text-muted-foreground sm:px-8">
        <Lock className="size-3.5" />Locks in {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
        <Button size="sm" variant="outline" onClick={() => { clearUnlock(); setUntil(0); }}>Lock now</Button>
      </div>
      {children}
    </>;
  }

  return <main className="flex min-h-0 flex-1 items-center justify-center bg-background px-4 py-10">
    <form className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-6" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError("");
      try {
        const r = await unlock({ data: { pin } });
        if (r.ok) { setUntil(markUnlocked()); setPin(""); } else setError(r.error ?? "Incorrect staff PIN");
      } catch { setError("Couldn't check your PIN. Try again."); } finally { setBusy(false); }
    }}>
      <div className="flex items-center gap-2"><KeyRound className="size-5 text-primary" /><h1 className="font-display text-xl font-bold">BM Player Admin login</h1></div>
      <p className="text-sm text-muted-foreground">Enter your Staff PIN. You'll stay signed in here for 15 minutes.</p>
      <Input type="password" inputMode="numeric" autoComplete="off" autoFocus aria-label="Staff PIN" placeholder="Staff PIN" value={pin} onChange={(e) => setPin(e.target.value)} aria-invalid={!!error} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy || !pin.trim()}>{busy ? <Loader2 className="animate-spin" /> : null}Log in</Button>
      <Link to="/staff-pin" className="block text-center text-xs text-muted-foreground hover:text-foreground">Forgotten your Staff PIN?</Link>
    </form>
  </main>;
}

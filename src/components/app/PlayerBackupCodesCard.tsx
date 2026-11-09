import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Lock, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revealPlayerBackupCodes } from "@/lib/player-pin.functions";

/** BM Player 2FA backup codes: locked until the customer re-enters their account password. */
export function PlayerBackupCodesCard() {
  const reveal = useServerFn(revealPlayerBackupCodes);
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<{ code: string; used: boolean }[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (renew: boolean) => {
    if (renew && !window.confirm("Make 10 new backup codes? Your old ones will stop working.")) return;
    setBusy(true); setError("");
    try {
      const r = await reveal({ data: { password, renew } });
      if (!r.ok) { setError(r.error); return; }
      setCodes(r.codes);
      if (renew) toast.success("New backup codes made");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't open your codes. Try again."); }
    finally { setBusy(false); }
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-surface p-6 space-y-4">
      <div>
        <h2 className="font-display font-semibold text-lg">BM Player backup codes</h2>
        <p className="text-sm text-muted-foreground">If you can't get to your authenticator app, type one of these 8-digit codes on your box instead. Each code works once.</p>
      </div>
      {!codes ? (
        <form onSubmit={(e) => { e.preventDefault(); void run(false); }} className="space-y-3">
          <p className="flex items-center gap-2 text-sm"><Lock className="size-4" /> Locked. Enter your account password to see them.</p>
          <Input type="password" autoComplete="current-password" aria-label="Account password" placeholder="Account password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy || !password}>{busy ? "Checking…" : "Unlock backup codes"}</Button>
        </form>
      ) : (
        <div className="space-y-3">
          <ul className="grid grid-cols-2 gap-2 font-mono text-base">
            {codes.map((c) => (
              <li key={c.code} className={c.used ? "rounded-md border border-border px-3 py-2 text-muted-foreground line-through" : "rounded-md border border-border px-3 py-2"}>{c.code}{c.used && <span className="ml-2 text-xs no-underline">used</span>}</li>
            ))}
          </ul>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { void navigator.clipboard.writeText(codes.filter((c) => !c.used).map((c) => c.code).join("\n")); toast.success("Unused codes copied"); }}><Copy className="size-4" /> Copy</Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void run(true)}><RefreshCw className="size-4" /> Make new codes</Button>
            <Button type="button" variant="ghost" onClick={() => { setCodes(null); setPassword(""); }}><Lock className="size-4" /> Lock again</Button>
          </div>
        </div>
      )}
    </section>
  );
}

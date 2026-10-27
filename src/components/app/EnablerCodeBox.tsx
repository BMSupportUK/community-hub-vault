import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmationActive, formatConfirmCode, normalizeConfirmCode } from "@/lib/enabler-confirm-code";

/** Customer types the code BM TV Enabler shows after it confirms the TV. */
export function EnablerCodeBox({ disabled, onSubmit, status, onActiveChange }: { disabled?: boolean; onSubmit: (code: string) => Promise<void>; status: () => Promise<{ expires_at: string | null }>; onActiveChange?: (active: boolean) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [expiry, setExpiry] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let stopped = false;
    setExpiry(undefined);
    const load = async () => { try { const result = await status(); if (!stopped) setExpiry(result.expires_at); } catch { /* Keep locked until status can be checked. */ } };
    void load();
    const poll = window.setInterval(load, 5000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { stopped = true; window.clearInterval(poll); window.clearInterval(clock); };
  }, [status]);
  const active = confirmationActive(expiry ?? null, now);
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);
  const locked = disabled || busy || expiry === undefined || active;
  const minutes = expiry ? Math.max(0, Math.ceil((Date.parse(expiry) - now) / 60000)) : 0;
  return <div aria-disabled={locked} className={`space-y-2 rounded-xl border border-primary/40 bg-card p-4 ${active ? "opacity-50" : ""}`}>
    <h3 className="font-semibold">Type the code from BM TV Enabler</h3>
    <p className="text-sm text-muted-foreground">{active ? `Your BM TV Enabler reference is active for another ${Math.floor(minutes / 60)}h ${minutes % 60}m. You do not need to enter another code yet.` : expiry === undefined ? "Checking your BM TV Enabler reference…" : "When BM TV Enabler (phone or Windows) has confirmed your TV, type its six-character code here."}</p>
    <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (locked || code.length !== 6) return; setBusy(true); try { await onSubmit(code); setCode(""); setExpiry(undefined); setExpiry((await status()).expires_at); } catch { /* caller shows the error */ } setBusy(false); }}>
      <Input disabled={locked} aria-label="Code from BM TV Enabler" autoCapitalize="characters" value={formatConfirmCode(code)} onChange={(e) => setCode(normalizeConfirmCode(e.target.value))} placeholder="K7P-4QX" className="font-mono text-lg uppercase" />
      <Button type="submit" disabled={locked || code.length !== 6}>Confirm</Button>
    </form>
    <p className="text-xs text-muted-foreground">You can reuse this code on the same ticket or order for 24 hours. After it expires, press New code in BM TV Enabler.</p>
  </div>;
}

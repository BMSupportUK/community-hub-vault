import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatConfirmCode, normalizeConfirmCode } from "@/lib/enabler-confirm-code";

/** Customer types the code BM TV Enabler shows after it confirms the TV. */
export function EnablerCodeBox({ disabled, onSubmit }: { disabled?: boolean; onSubmit: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return <div className="space-y-2 rounded-xl border border-primary/40 bg-card p-4">
    <h3 className="font-semibold">Type the code from BM TV Enabler</h3>
    <p className="text-sm text-muted-foreground">When BM TV Enabler (phone or Windows) has confirmed your TV, it shows a six-character code like K7P-4QX. Type it here to tick your steps.</p>
    <form className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await onSubmit(code); setCode(""); } catch { /* caller shows the error */ } setBusy(false); }}>
      <Input aria-label="Code from BM TV Enabler" autoCapitalize="characters" value={formatConfirmCode(code)} onChange={(e) => setCode(normalizeConfirmCode(e.target.value))} placeholder="K7P-4QX" className="font-mono text-lg uppercase" />
      <Button type="submit" disabled={disabled || busy || code.length !== 6}>Confirm</Button>
    </form>
    <p className="text-xs text-muted-foreground">You can reuse this code on the same ticket or order for 24 hours. After it expires, press New code in BM TV Enabler.</p>
  </div>;
}

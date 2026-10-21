import { useState, type FormEvent } from "react";
import { Loader2, Mail, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { portalLoginCodeSchema } from "@/lib/customer-portal";

export function PortalCodeForm({ onSend, onUnlock }: { onSend: () => Promise<unknown>; onUnlock: (code: string) => Promise<void> }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"send" | "unlock" | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    setBusy("send"); setError("");
    try { await onSend(); setSent(true); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(null); }
  }
  async function unlock(event: FormEvent) {
    event.preventDefault(); setError("");
    const parsed = portalLoginCodeSchema.safeParse(code);
    if (!parsed.success) { setError("Enter your 8-digit login code."); return; }
    setBusy("unlock");
    try { await onUnlock(parsed.data); } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(null); }
  }
  return <div className="mt-5 space-y-4">
    <Button className="w-full" variant="outline" disabled={busy !== null} onClick={() => void send()}>{busy === "send" ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}{sent ? "Email a new code" : "Email me a login code"}</Button>
    {sent && <p role="status" className="text-sm text-muted-foreground">Code requested — check your email and spam folder.</p>}
    <form onSubmit={unlock} className="space-y-3 text-left">
      <label className="text-sm font-medium" htmlFor="portal-login-code">Login code</label>
      <Input id="portal-login-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" maxLength={8} placeholder="8-digit code" className="h-12 text-center font-mono text-xl" />
      <Button type="submit" className="w-full" disabled={busy !== null || code.length !== 8}>{busy === "unlock" ? <Loader2 className="size-4 animate-spin" /> : <Unlock className="size-4" />}Unlock portal</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
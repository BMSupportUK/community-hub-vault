import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PortalTabs } from "@/components/app/PortalTabs";
import { ManualCredentialCards } from "@/components/app/ManualCredentialCards";
import { readPortalCredentials, requestPortalPinReset } from "@/lib/customer-portal.functions";
import type { ManualCredential } from "@/lib/manual-credentials-schema";
import tvLoginIllustration from "@/assets/tv-login-illustration.jpg";

type QdCode = { id: string; label: string; code: string; notes: string | null };

export const Route = createFileRoute("/_authenticated/_approved/portal/logins")({
  component: PortalLoginsPage,
  head: () => ({ meta: [
    { title: "My App Logins | BM Support Customer Portal" },
    { name: "description", content: "View your BM Support TV app login details after entering your PIN." },
    { property: "og:title", content: "My App Logins | BM Support Customer Portal" },
    { property: "og:description", content: "View your BM Support TV app login details after entering your PIN." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex, nofollow" },
  ] }),
});

function AppInformationPanel({ codes }: { codes: QdCode[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return <aside className="rounded-lg border border-border bg-surface/80 p-4">
    <h2 className="font-display text-sm font-semibold">App Information</h2>
    {codes.length ? codes.map((q) => <div key={q.id} className="mt-3">
      <div className="text-xs text-muted-foreground">QD code · {q.label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="break-all font-mono text-base font-semibold">{q.code}</span>
        <button type="button" aria-label={`Copy ${q.label} QD code`} onClick={() => { void navigator.clipboard.writeText(q.code); setCopied(q.id); setTimeout(() => setCopied(null), 1500); }} className="inline-flex shrink-0 items-center gap-1 text-xs text-primary hover:underline">{copied === q.id ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied === q.id ? "Copied" : "Copy"}</button>
      </div>
      {q.notes && <p className="mt-1 text-xs text-muted-foreground">{q.notes}</p>}
    </div>) : <p className="mt-2 text-xs text-muted-foreground">No app information has been added yet.</p>}
  </aside>;
}

function PortalLoginsPage() {
  const read = useServerFn(readPortalCredentials);
  const requestReset = useServerFn(requestPortalPinReset);
  const [pin, setPin] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [resetBusy, setResetBusy] = useState(false), [resetDone, setResetDone] = useState(false);
  const [accounts, setAccounts] = useState<ManualCredential[] | null>(null), [qdCodes, setQdCodes] = useState<QdCode[]>([]), [expiresAt, setExpiresAt] = useState<number | null>(null), [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!expiresAt) return; const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t); }, [expiresAt]);
  const remaining = expiresAt ? Math.max(0, expiresAt - now) : 0;
  useEffect(() => { if (expiresAt && remaining === 0) { setAccounts(null); setExpiresAt(null); setError("Your 10-minute viewing time has ended. Enter your PIN again to view your logins."); } }, [expiresAt, remaining]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    setResetDone(false);
    if (!/^\d{6}$/.test(pin)) { setError("Enter your 6-digit PIN."); return; }
    setBusy(true);
    try { const r = await read({ data: { pin } }); setAccounts(r.accounts); setQdCodes(r.qdCodes); setExpiresAt(new Date(r.expiresAt).getTime()); setNow(Date.now()); if (r.created) toast.success("Your PIN is saved. Use it next time to view your logins."); }
    catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setPin(""); setBusy(false); }
  }
  return <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
    <div className="pointer-events-none absolute inset-0 z-0" aria-hidden>
      <img src={tvLoginIllustration} alt="" className="h-full w-full object-cover brightness-[0.4]" />
      <div className="absolute inset-0 bg-background/40" />
    </div>
    <div className="relative z-10"><PortalTabs active="logins" /></div>
    <main className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8"><div className="mx-auto max-w-5xl rounded-2xl border border-border bg-background/80 p-4 backdrop-blur sm:p-6">
      <h1 className="mb-1 font-display text-2xl font-bold">My App Logins</h1>
      <p className="mb-6 text-sm text-muted-foreground">Your TV app usernames and passwords. Enter your PIN to show them for 10 minutes.</p>
      {!accounts ? <form onSubmit={submit} className="max-w-sm space-y-4 rounded-xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 font-semibold"><Lock className="size-4 text-primary" />Enter your 6-digit PIN</div>
        <p className="text-xs text-muted-foreground">First time? The PIN you enter now becomes your PIN. Five wrong tries locks access for one hour.</p>
        <input aria-label="6-digit PIN" type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full rounded-md border border-border bg-surface-2 px-3 py-3 text-center font-mono text-lg tracking-[0.5em]" />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />}Show my logins</Button>
        {resetDone ? <p role="status" className="rounded-md border border-border bg-surface-2 p-3 text-xs text-muted-foreground">Your PIN has been cleared and our team has been told. Enter a new 6-digit PIN above — it becomes your new PIN.</p>
        : <button type="button" disabled={resetBusy} onClick={async () => {
            setError(""); setResetBusy(true);
            try { await requestReset(); setResetDone(true); }
            catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
            finally { setResetBusy(false); }
          }} className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-primary hover:underline disabled:opacity-60">
          {resetBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}Forgot your PIN? Reset it
        </button>}
      </form> : <>
        <div role="timer" className="mb-6 rounded-lg border border-border bg-surface p-4"><div className="flex items-center justify-between text-sm"><span>These details hide automatically for your security</span><span className="font-mono text-lg font-semibold text-primary">{Math.floor(remaining / 60000)}:{String(Math.floor(remaining / 1000) % 60).padStart(2, "0")}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-1000" style={{ width: `${(remaining / 600000) * 100}%` }} /></div></div>
        {accounts.length ? <ManualCredentialCards readOnly customers={[{ userId: "portal", displayName: "My accounts", accounts }]} aside={<AppInformationPanel codes={qdCodes} />} />
        : <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <p className="text-sm text-muted-foreground">No app logins have been saved on your account yet.</p>
          <AppInformationPanel codes={qdCodes} />
        </div>}
      </>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </div></main>
  </div>;
}

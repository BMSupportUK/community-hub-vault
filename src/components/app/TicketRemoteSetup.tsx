import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { TV_ENABLER_URL } from "@/components/app/TvEnablerPanel";
import { WINDOWS_ENABLER_URL } from "@/components/app/WindowsTvEnablerPanel";
import { RemoteSetupProgress } from "@/components/app/RemoteSetupProgress";
import { CheckCircle2, Circle, Smartphone, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizePairCode } from "@/lib/tv-remote";
import { REMOTE_SETUP_STEPS, appChecksPassed, stepDone, type AppChecks, type SetupDevice } from "@/lib/ticket-remote-setup";

export type RemoteSetupRow = { device: SetupDevice; app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null } | null;

export function useTicketRemoteSetup(ticketId: string) {
  const [row, setRow] = useState<RemoteSetupRow | undefined>(undefined);
  const load = useCallback(async () => {
    const { data } = await supabase.from("ticket_remote_setup" as never).select("device,app_checks,app_checked_at,completed_at").eq("ticket_id", ticketId).maybeSingle();
    setRow((data as RemoteSetupRow) ?? null);
  }, [ticketId]);
  useEffect(() => {
    void load();
    // Ticks appear the moment the app reports; the slow poll is only a fallback.
    const channel = supabase.channel(`ticket-remote-setup-${ticketId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_remote_setup", filter: `ticket_id=eq.${ticketId}` }, () => { void load(); })
      .subscribe();
    const t = window.setInterval(load, 10000);
    return () => { window.clearInterval(t); void supabase.removeChannel(channel); };
  }, [load, ticketId]);
  return { row, reload: load };
}

export function TicketRemoteSetup({ ticketId, customer, closed, row, reload }: { ticketId: string; customer: boolean; closed: boolean; row: RemoteSetupRow | undefined; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [setupCode, setSetupCode] = useState<string | null>(null);
  const save = async (device: SetupDevice) => {
    setBusy(true);
    const { error } = await supabase.rpc("save_ticket_remote_setup" as never, { _ticket_id: ticketId, _device: device, _steps: [] } as never);
    if (error) toast.error(error.message);
    setSetupCode(null);
    await reload(); setBusy(false);
  };
  const restart = async () => {
    if (!window.confirm("Restart the TV setup from the beginning? Your saved progress and codes for this ticket will be cleared.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("reset_ticket_remote_setup" as never, { _ticket_id: ticketId } as never);
    if (error) toast.error(error.message); else toast.success("Setup restarted — choose your device to begin again");
    setSetupCode(null); setCode("");
    await reload(); setBusy(false);
  };
  const issue = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("issue_ticket_setup_code" as never, { _ticket_id: ticketId } as never);
    if (error) toast.error(error.message); else setSetupCode(data as unknown as string);
    setBusy(false);
  };
  const verify = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("verify_ticket_remote_setup" as never, { _ticket_id: ticketId, _code: code } as never);
    if (error) toast.error(error.message);
    else if (!data) toast.error("That code isn't live. Check BM Remote Helper is open on the TV and try the code it shows now.");
    else { toast.success("BM Remote Helper confirmed — staff can now request your screen"); setCode(""); }
    await reload(); setBusy(false);
  };
  if (row === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!customer) return <StaffRemoteSetup ticketId={ticketId} row={row} reload={reload} />;
  if (!row) {
    return <section className="mx-auto max-w-2xl space-y-4 text-foreground">
      <h2 className="text-xl font-semibold">Which TV device are you using?</h2>
      <p className="text-sm text-muted-foreground">Complete these steps so our team can help you through screen sharing.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" className="h-24 flex-col gap-2" disabled={busy || closed} onClick={() => void save("amazon")}><Tv className="size-6" />Amazon Fire TV</Button>
        <Button variant="outline" className="h-24 flex-col gap-2" disabled={busy || closed} onClick={() => void save("android")}><Smartphone className="size-6" />Android / Google TV</Button>
      </div>
    </section>;
  }
  const steps = REMOTE_SETUP_STEPS[row.device];
  const ready = appChecksPassed(row.app_checks, row.device);
  const complete = Boolean(row.completed_at);
  const main = <section className="min-w-0 space-y-4 text-foreground">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-xl font-semibold">{row.device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"} setup</h2>
      {!row.completed_at && <Button size="sm" variant="ghost" className="ml-auto" disabled={busy || closed} onClick={() => void save(row.device === "amazon" ? "android" : "amazon")}>Change device</Button>}
      {!closed && <Button size="sm" variant="ghost" className={row.completed_at ? "ml-auto" : ""} disabled={busy} onClick={() => void restart()}>Restart setup</Button>}
    </div>
    {(row.completed_at || ready) && !closed && <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
      <h3 className="font-semibold">Your TV code</h3>
      <p className="text-sm">{row.completed_at ? "All done — your TV is ready. " : ""}Open BM Remote Helper on the TV and enter the six-digit code it shows.</p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void verify(); }}>
        <Input aria-label="Code shown on your TV" inputMode="numeric" value={code} onChange={(e) => setCode(normalizePairCode(e.target.value))} placeholder="123456" className="font-mono text-lg" />
        <Button type="submit" disabled={busy || code.length !== 6}>Send to staff</Button>
      </form>
    </div>}
    {!closed && <div className="rounded-xl border border-primary/40 bg-card p-4 space-y-2">
      <h3 className="font-semibold">Your setup code</h3>
      <p className="text-sm text-muted-foreground">Type this eight-digit code into BM TV Enabler to link its checked progress to this ticket. It remains available when your TV is already set up.</p>
      {setupCode
        ? <p className="font-mono text-3xl font-bold tracking-widest">{setupCode.slice(0, 4)} {setupCode.slice(4)}</p>
        : <Button size="sm" disabled={busy} onClick={() => void issue()}>Show my setup code</Button>}
      {setupCode && <><p className="text-xs text-muted-foreground">Valid for 2 hours. Showing a new code cancels the old one.</p><Button size="sm" variant="outline" disabled={busy} onClick={() => void issue()}>New setup code</Button></>}
    </div>}
    <RemoteSetupProgress row={row} />
    {!complete && steps.map((s, i) => {
      const done = stepDone(s, row);
      return <article key={i} className={`rounded-xl border p-4 space-y-2 ${done ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
        <h3 className="flex items-center gap-2 font-semibold">{done ? <CheckCircle2 className="size-5 text-primary" /> : <span className="flex size-5 items-center justify-center rounded-full border border-border text-xs">{i + 1}</span>}{s.title}</h3>
        <p className="text-sm text-muted-foreground">{s.body}</p>
        {!done && <p className="text-xs text-muted-foreground">{s.proof === "code" ? (ready ? "Enter the TV code in the box at the top." : "Unlocks once the app has checked your TV.") : "Ticks automatically when the app checks your TV."}</p>}
      </article>;
    })}
  </section>;
  return <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
    {main}
    <aside className="h-fit space-y-2 rounded-xl border border-primary/40 bg-card p-4 text-center text-foreground lg:sticky lg:top-4"><EnablerQr /><div className="space-y-2 border-t border-border pt-3"><h3 className="font-semibold">No Android phone? Use a Windows PC</h3><p className="text-sm text-muted-foreground">Install BM TV Enabler for Windows, type the same setup code, and it ticks the steps the same way.</p><Button asChild size="sm" className="w-full"><a href={WINDOWS_ENABLER_URL} download="BM-TV-Enabler-Setup-1.2.0.exe">Download for Windows</a></Button><p className="text-xs text-muted-foreground">Windows 10 / 11 · free, unsigned — choose More info › Run anyway if warned.</p></div></aside>
  </div>;
}

/** Staff view: subscribes itself so ticks and completion appear in real time. */
function StaffRemoteSetup({ ticketId, row, reload }: { ticketId: string; row: RemoteSetupRow | undefined; reload: () => Promise<void> }) {
  useEffect(() => {
    const channel = supabase.channel(`ticket-remote-setup-staff-${ticketId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_remote_setup", filter: `ticket_id=eq.${ticketId}` }, () => { void reload(); })
      .subscribe();
    const t = window.setInterval(() => { void reload(); }, 5000);
    return () => { window.clearInterval(t); void supabase.removeChannel(channel); };
  }, [ticketId, reload]);
  return <section className="mx-auto max-w-2xl space-y-3 text-foreground">
    <h2 className="text-xl font-semibold">Remote access setup</h2>
    {!row ? <p className="text-sm text-muted-foreground">The customer hasn't chosen their device yet.</p> : <>
      <RemoteSetupProgress row={row} />
      <p className="text-sm">Device: <strong>{row.device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"}</strong> · {row.completed_at ? <span className="font-semibold text-primary">Confirmed by the apps</span> : row.app_checked_at ? "App reported — waiting on the rest" : "Waiting for the app to report"}</p>
      {!row.completed_at && <>
        <ol className="space-y-2">{REMOTE_SETUP_STEPS[row.device].map((s, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">{stepDone(s, row) ? <CheckCircle2 className="size-4 text-primary" /> : <Circle className="size-4 text-muted-foreground" />}{s.title}</li>
        ))}</ol>
        <p className="text-xs text-muted-foreground">Ticks come only from BM TV Enabler / BM Support app checking the TV, and from BM Remote Helper's live code — the customer can't tick them.</p>
      </>}
    </>}
  </section>;
}

function EnablerQr() {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(TV_ENABLER_URL, { width: 400, margin: 1 }).then(setQr).catch(() => setQr(null)); }, []);
  return <>
    <h3 className="font-semibold">Get BM TV Enabler</h3>
    <p className="text-sm text-muted-foreground">Scan with your Android phone to download and install the app.</p>
    {qr ? <img src={qr} alt="QR code to download BM TV Enabler" width={220} height={220} className="mx-auto rounded-md bg-card p-2" /> : <p className="text-sm text-muted-foreground">Loading…</p>}
    <a href={TV_ENABLER_URL} className="block text-xs text-primary underline">Or tap here on your phone</a>
  </>;
}

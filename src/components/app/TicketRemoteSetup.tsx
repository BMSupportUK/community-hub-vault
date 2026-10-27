import { useCallback, useEffect, useState } from "react";
import { EnablerCodeBox } from "@/components/app/EnablerCodeBox";
import { EnablerLinkBox } from "@/components/app/EnablerLinkBox";
import { EnablerPinBox } from "@/components/app/EnablerPinBox";
import { useServerFn } from "@tanstack/react-start";
import { createTicketEnablerPin, getTicketEnablerPinStatus } from "@/lib/enabler-pin.functions";
import QRCode from "qrcode";
import { TV_ENABLER_URL } from "@/components/app/TvEnablerPanel";
import { WindowsEnablerDownload } from "@/components/app/WindowsEnablerDownload";
import { RemoteSetupProgress } from "@/components/app/RemoteSetupProgress";
import { RemoteSetupWizard } from "@/components/app/RemoteSetupWizard";
import { CheckCircle2, Circle, Smartphone, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { renewalMessage } from "@/lib/enabler-renewal";
import { useEnablerRenewalGate } from "@/hooks/use-enabler-renewal-gate";
import { getTicketEnablerConfirmationStatus } from "@/lib/enabler-confirm-status.functions";
import { REMOTE_SETUP_STEPS, appChecksPassed, checksFresh, connectionReady, stepDone, type AppChecks, type SetupDevice } from "@/lib/ticket-remote-setup";

export type RemoteSetupRow = { device: SetupDevice; app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null; checks_used_at?: string | null; pending_session_id?: string | null } | null;

export function useTicketRemoteSetup(ticketId: string) {
  const [row, setRow] = useState<RemoteSetupRow | undefined>(undefined);
  const load = useCallback(async () => {
    const { data } = await supabase.from("ticket_remote_setup" as never).select("device,app_checks,app_checked_at,completed_at,checks_used_at,pending_session_id").eq("ticket_id", ticketId).maybeSingle();
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
  const confirmationStatusFn = useServerFn(getTicketEnablerConfirmationStatus);
  const confirmationStatus = useCallback(() => confirmationStatusFn({ data: { ticketId } }), [confirmationStatusFn, ticketId]);
  const [renewal, setRenewal] = useState("");
  const [referenceActive, setReferenceActive] = useState(false);
  const renewalGate = useEnablerRenewalGate(`ticket:${ticketId}`, row ? [row.pending_session_id ?? "", row.app_checked_at ?? "", (row as { checks_used_at?: string | null }).checks_used_at ?? ""].join("|") : null);
  const save = async (device: SetupDevice) => {
    setBusy(true);
    const { error } = await supabase.rpc("save_ticket_remote_setup" as never, { _ticket_id: ticketId, _device: device, _steps: [] } as never);
    if (error) toast.error(error.message);
    await reload(); setBusy(false);
  };
  const restart = async () => {
    if (!window.confirm("Restart the TV setup from the beginning? The ticks on this page will be cleared. A BM TV Enabler reference that is still within its 24 hours keeps working — just press Get new connection.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("reset_ticket_remote_setup" as never, { _ticket_id: ticketId } as never);
    if (error) toast.error(error.message); else toast.success("Setup restarted — choose your device to begin again");
    setRenewal("");
    renewalGate.reset();
    await reload(); setBusy(false);
  };
  const redeem = async (c: string) => {
    const { data, error } = await supabase.rpc("redeem_ticket_enabler_code" as never, { _ticket_id: ticketId, _code: c } as never);
    const r = data as unknown as string;
    if (error) { toast.error(error.message); throw error; }
    if (r === "device_mismatch") { toast.error("BM TV Enabler was set up for the other TV type. Press Change device, or pick the other TV type in the app."); throw new Error(r); }
    if (r !== "ok") { toast.error("That code isn't valid. Check BM TV Enabler and type the code it shows now."); throw new Error(r); }
    toast.success("BM TV Enabler confirmed your TV");
    await reload();
  };
  const connect = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc("connect_ticket_remote_setup" as never, { _ticket_id: ticketId } as never);
    if (error) toast.error(error.message);
    else if (!data) toast.error("The TV connection has ended. Press Get new connection and keep BM TV Enabler open.");
    else toast.success("Connected — staff have been told your TV is ready");
    await reload(); setBusy(false);
  };
  const renew = async () => {
    if (busy || !renewalGate.begin()) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("request_ticket_enabler_connection", { _ticket_id: ticketId });
      renewalGate.finish(error ? "failed" : String(data));
      if (error) toast.error(error.message);
      else { setRenewal(renewalMessage(String(data))); if (data !== "queued") toast.error(renewalMessage(String(data))); }
      await reload();
    } catch (e) {
      renewalGate.finish("failed");
      toast.error(e instanceof Error ? e.message : "Could not request a new connection");
    } finally { setBusy(false); }
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
  const ready = appChecksPassed(row.app_checks, row.device);
  const fresh = checksFresh(row);
  const canConnect = connectionReady(row) && !renewalGate.waiting;
  const complete = Boolean(row.completed_at);
  const main = <section className="min-w-0 space-y-4 text-foreground">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="text-xl font-semibold">{row.device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"} setup</h2>
      {!row.completed_at && <Button size="sm" variant="ghost" className="ml-auto" disabled={busy || closed} onClick={() => void save(row.device === "amazon" ? "android" : "amazon")}>Change device</Button>}
      {!closed && <Button size="sm" variant="ghost" className={row.completed_at ? "ml-auto" : ""} disabled={busy} onClick={() => void restart()}>Restart setup</Button>}
    </div>
    <RemoteSetupWizard row={row} referenceActive={referenceActive}
      confirmation={!closed ? <EnablerCodeBox disabled={busy} status={confirmationStatus} onSubmit={redeem} onActiveChange={setReferenceActive} /> : null}
      connection={<>
    {canConnect && !closed && <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
      <h3 className="font-semibold">Your TV is ready</h3>
      <p className="text-sm">BM TV Enabler has already picked up the code from BM Remote Helper. Press Connect to send your screen-share request to staff.</p>
      <Button size="lg" className="w-full" disabled={busy} onClick={() => void connect()}>Connect</Button>
    </div>}
    {!closed && (!canConnect) && (ready || complete || referenceActive) && <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
      <h3 className="font-semibold">Get a new TV connection</h3>
      <p className="text-sm" role="status">{renewal || "Keep BM TV Enabler open on the same Wi-Fi as your TV. Every screen share needs a new TV connection. Your 24-hour confirmation reference stays the same."}</p>
      <Button size="lg" className="w-full" disabled={busy || renewalGate.waiting} onClick={() => void renew()}>{renewalGate.waiting ? "Connection requested…" : "Get new connection"}</Button>
    </div>}
    {!canConnect && !ready && !complete && !referenceActive && <p className="text-sm text-muted-foreground" role="status">Waiting for BM TV Enabler to confirm your TV. Enter its reference in the previous step.</p>}
    </>} />
  </section>;
  return <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1fr)_260px_260px]">
    {main}
    <aside className="h-fit space-y-3 border-l border-border p-4 text-center text-foreground lg:sticky lg:top-4"><EnablerQr />{!closed && <TicketPin ticketId={ticketId} />}</aside>
    <aside className="h-fit space-y-3 border-l border-border p-4 text-center text-foreground lg:sticky lg:top-4"><WindowsEnablerDownload /></aside>
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
    <TicketPin ticketId={ticketId} staff />
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

function TicketPin({ ticketId, staff }: { ticketId: string; staff?: boolean }) {
  const createFn = useServerFn(createTicketEnablerPin), statusFn = useServerFn(getTicketEnablerPinStatus);
  const create = useCallback(() => createFn({ data: { ticketId } }), [createFn, ticketId]);
  const status = useCallback(() => statusFn({ data: { ticketId } }), [statusFn, ticketId]);
  return <EnablerPinBox scopeKey={`ticket:${ticketId}`} staff={staff} create={staff ? undefined : create} status={status} />;
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

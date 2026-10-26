import { useCallback, useEffect, useState, type ReactNode } from "react";
import { EnablerCodeBox } from "@/components/app/EnablerCodeBox";
import { EnablerLinkBox } from "@/components/app/EnablerLinkBox";
import { EnablerPinBox } from "@/components/app/EnablerPinBox";
import { createOrderEnablerPin, getOrderEnablerPinStatus } from "@/lib/enabler-pin.functions";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { CheckCircle2, Loader2, MonitorUp, Smartphone, Tv } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renewalMessage } from "@/lib/enabler-renewal";
import { useEnablerRenewalGate } from "@/hooks/use-enabler-renewal-gate";
import { TV_ENABLER_URL } from "@/components/app/TvEnablerPanel";
import { WINDOWS_ENABLER_URL } from "@/components/app/WindowsTvEnablerPanel";
import { RemoteSetupProgress } from "@/components/app/RemoteSetupProgress";
import { screenShareInProgress } from "@/lib/tv-remote";
import { REMOTE_SETUP_STEPS, appChecksPassed, checksFresh, stepDone, type AppChecks, type SetupDevice } from "@/lib/ticket-remote-setup";
import { getOrderRemoteSetup, redeemOrderEnablerCode, resetOrderRemoteSetup, issueOrderSetupCode, saveOrderRemoteSetup, verifyOrderRemoteSetup, requestOrderEnablerConnection } from "@/lib/order-remote-setup.functions";
import { getCheckoutScreenShareStatus } from "@/lib/tv-help.functions";

type Row = { device: SetupDevice; app_checks: AppChecks | null; app_checked_at: string | null; completed_at: string | null; checks_used_at?: string | null; pending_session_id?: string | null } | null;
type Tab = "order" | "remote" | "screen";

/** Customer secure order: Order / Remote setup / Screen share tabs across the top. */
export function OrderRemoteTabs({ token, password, children }: { token: string; password: string; children: ReactNode }) {
  const [tab, setTab] = useState<Tab>("order");
  const btn = (t: Tab, label: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>{label}</button>
  );
  return <>
    <div className="w-full px-3 pt-3">
      <div className="inline-flex flex-wrap rounded-xl border border-border bg-card/85 p-1 backdrop-blur-sm" role="tablist">
        {btn("order", "Order")}{btn("remote", "Remote setup")}{btn("screen", "Screen share")}
      </div>
    </div>
    <div className={tab === "order" ? "" : "hidden"}>{children}</div>
    {tab === "remote" && <div className="px-3 py-6"><OrderRemoteSetup token={token} password={password} /></div>}
    {tab === "screen" && <div className="px-3 py-6"><OrderShareStatus token={token} password={password} onSetup={() => setTab("remote")} /></div>}
  </>;
}

function OrderRemoteSetup({ token, password }: { token: string; password: string }) {
  const get = useServerFn(getOrderRemoteSetup), saveFn = useServerFn(saveOrderRemoteSetup), redeemFn = useServerFn(redeemOrderEnablerCode), verifyFn = useServerFn(verifyOrderRemoteSetup), resetFn = useServerFn(resetOrderRemoteSetup), issueFn = useServerFn(issueOrderSetupCode);
  const [row, setRow] = useState<Row | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [renewal, setRenewal] = useState("");
  const renewalGate = useEnablerRenewalGate(`order:${token}`, row?.pending_session_id ?? null);
  const renewFn = useServerFn(requestOrderEnablerConnection);
  const load = useCallback(async () => { try { setRow((await get({ data: { token, password } })) as Row); } catch { setRow(null); } }, [get, token, password]);
  useEffect(() => { void load(); const t = window.setInterval(load, 4000); return () => window.clearInterval(t); }, [load]);
  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); } await load(); setBusy(false); };
  const save = (device: SetupDevice) => run(async () => { await saveFn({ data: { token, password, device } }); });
  const redeem = async (c: string) => {
    const r = await redeemFn({ data: { token, password, code: c } });
    if (!r.ok) { toast.error(r.error); throw new Error(r.error); }
    toast.success("BM TV Enabler confirmed your TV"); await load();
  };
  const restart = () => {
    if (!window.confirm("Restart the TV setup from the beginning? Your saved progress and codes for this order will be cleared.")) return;
    void run(async () => { await resetFn({ data: { token, password } }); setRenewal(""); renewalGate.reset(); toast.success("Setup restarted — choose your device to begin again"); });
  };
  const connect = () => run(async () => {
    const r = await verifyFn({ data: { token, password } });
    if (!r.ok) toast.error(r.error); else toast.success("Connected — staff have been told your TV is ready");
  });
  const renew = () => {
    if (busy || !renewalGate.begin()) return;
    return run(async () => {
      try {
        const state = await renewFn({ data: { token, password } });
        renewalGate.finish(state);
        setRenewal(renewalMessage(state));
        if (state !== "queued") toast.error(renewalMessage(state));
      } catch (e) { renewalGate.finish("failed"); throw e; }
    });
  };

  if (row === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!row) return <section className="mx-auto max-w-2xl space-y-4 text-foreground">
    <h2 className="text-xl font-semibold">Which TV device are you using?</h2>
    <p className="text-sm text-muted-foreground">Complete these steps so our team can help you through screen sharing.</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <Button variant="outline" className="h-24 flex-col gap-2" disabled={busy} onClick={() => void save("amazon")}><Tv className="size-6" />Amazon Fire TV</Button>
      <Button variant="outline" className="h-24 flex-col gap-2" disabled={busy} onClick={() => void save("android")}><Smartphone className="size-6" />Android / Google TV</Button>
    </div>
  </section>;

  const ready = appChecksPassed(row.app_checks, row.device);
  const fresh = checksFresh(row);
  return <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
    <section className="min-w-0 space-y-4 text-foreground">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-semibold">{row.device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"} setup</h2>
        {!row.completed_at && <Button size="sm" variant="ghost" className="ml-auto" disabled={busy} onClick={() => void save(row.device === "amazon" ? "android" : "amazon")}>Change device</Button>}
        <Button size="sm" variant="ghost" className={row.completed_at ? "ml-auto" : ""} disabled={busy} onClick={restart}>Restart setup</Button>
      </div>
      {fresh && row.pending_session_id && <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
        <h3 className="font-semibold">Your TV is ready</h3>
        <p className="text-sm">BM TV Enabler has already picked up the code from BM Remote Helper. Press Connect to send your screen-share request to staff.</p>
        <Button size="lg" className="w-full" disabled={busy} onClick={() => void connect()}>Connect</Button>
      </div>}
      {(!fresh || !row.pending_session_id) && (ready || row.completed_at) && <div className="space-y-3 rounded-xl border border-primary/40 bg-primary/10 p-4">
        <h3 className="font-semibold">Get a new TV connection</h3>
        <p className="text-sm" role="status">{renewal || "Keep BM TV Enabler open on the same Wi-Fi as your TV. Your valid 24-hour confirmation reference stays the same."}</p>
        <Button size="lg" className="w-full" disabled={busy || renewalGate.waiting} onClick={() => void renew()}>{renewalGate.waiting ? "Connection requested…" : "Get new connection"}</Button>
      </div>}
      {!fresh && <EnablerCodeBox disabled={busy} onSubmit={redeem} />}
      <RemoteSetupProgress row={row} />
      {!row.completed_at && REMOTE_SETUP_STEPS[row.device].map((s, i) => {
        const done = stepDone(s, row);
        return <article key={i} className={`space-y-2 rounded-xl border p-4 ${done ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
          <h3 className="flex items-center gap-2 font-semibold">{done ? <CheckCircle2 className="size-5 text-primary" /> : <span className="flex size-5 items-center justify-center rounded-full border border-border text-xs">{i + 1}</span>}{s.title}</h3>
          <p className="text-sm text-muted-foreground">{s.body}</p>
          {!done && <p className="text-xs text-muted-foreground">{s.proof === "code" ? (ready ? "Press Connect once Enabler brings your TV connection here." : "Unlocks once the app has checked your TV.") : "Ticks automatically when the app checks your TV."}</p>}
        </article>;
      })}
    </section>
    <aside className="h-fit space-y-2 rounded-xl border border-primary/40 bg-card p-4 text-center text-foreground lg:sticky lg:top-4"><OrderPin token={token} password={password} />
      <EnablerQr />
      <div className="space-y-2 border-t border-border pt-3">
        <h3 className="font-semibold">No Android phone? Use a Windows PC</h3>
        <p className="text-sm text-muted-foreground">Install BM TV Enabler for Windows, then type the code it shows here — it ticks the steps the same way.</p>
        <Button asChild size="sm" className="w-full"><a href={WINDOWS_ENABLER_URL} download="BM-TV-Enabler-Setup.exe">Download for Windows</a></Button>
      </div>
    </aside>
  </div>;
}

function OrderPin({ token, password }: { token: string; password: string }) {
  const createFn = useServerFn(createOrderEnablerPin), statusFn = useServerFn(getOrderEnablerPinStatus);
  const create = useCallback(() => createFn({ data: { token, password } }), [createFn, token, password]);
  const status = useCallback(() => statusFn({ data: { token, password } }), [statusFn, token, password]);
  return <EnablerPinBox scopeKey={`order:${token}`} create={create} status={status} />;
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

/** Screen share tab: status only — codes are entered on Remote setup. */
function OrderShareStatus({ token, password, onSetup }: { token: string; password: string; onSetup: () => void }) {
  const check = useServerFn(getCheckoutScreenShareStatus);
  const [status, setStatus] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let stop = false;
    const load = () => check({ data: { token, password } }).then((r) => { if (!stop) setStatus(screenShareInProgress(r.status) ? r.status : null); }).catch(() => {});
    load(); const t = window.setInterval(load, 2000);
    return () => { stop = true; window.clearInterval(t); };
  }, [token, password, check]);
  const box = (icon: ReactNode, title: string, body: ReactNode) => <section className="mx-auto max-w-2xl space-y-3 rounded-xl border border-primary/40 bg-card p-5 text-foreground">
    <h2 className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</h2><div className="text-sm text-muted-foreground">{body}</div></section>;
  if (status === undefined) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (status === "pending") return box(<Loader2 className="size-5 animate-spin text-primary" />, "Waiting for staff", "Staff have been told your TV is ready. When they connect, press Allow and then Start on your TV.");
  if (status) return box(<CheckCircle2 className="size-5 text-primary" />, "Your screen is being shared", "Staff are connected to your TV. You can keep using your order page — the screen share carries on.");
  return box(<MonitorUp className="size-5 text-primary" />, "No screen share yet", <>Request a new connection on Remote setup, then press Connect when your TV is ready.<div className="mt-3"><Button size="sm" onClick={onSetup}>Go to Remote setup</Button></div></>);
}

import { AppPickCards } from "@/components/app/AppDemos";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { useNavigate } from "@tanstack/react-router";
import { MonitorDown, ArrowLeft, ArrowRight, CheckCircle2, Download, Headset, KeyRound, Loader2, PlayCircle, Tv } from "lucide-react";
import { DirectInstallSteps } from "@/components/app/DirectInstallSteps";
import { useAlternativeInstallEnabled } from "@/hooks/use-alternative-install";
import { SetupStepVideo } from "@/components/app/SetupStepVideo";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TV_ENABLER_URL } from "@/components/app/TvEnablerPanel";
import { WindowsEnablerDownload } from "@/components/app/WindowsEnablerDownload";
import { EnablerPinBox } from "@/components/app/EnablerPinBox";
import { revealEnablerPin, createAccountEnablerPin, getAccountEnablerPinStatus } from "@/lib/enabler-pin.functions";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessOpen } from "@/hooks/use-business-open";
import { supabase } from "@/integrations/supabase/client";
import { orderStaffHelpTicket } from "@/lib/order-remote-tabs";
import { selfInstallHandoff, sha256Hex } from "@/lib/enabler-handoff";
import { createEnablerHandoff } from "@/lib/enabler-handoff.functions";

export type SetupDeviceKey = "amazon" | "android" | "direct" | "alternative" | "remote";

const DEVICES: { key: SetupDeviceKey; label: string; note: string; icon: typeof Tv }[] = [
  { key: "direct", label: "BM Direct Install", note: "Install straight on the TV, no phone or PC", icon: MonitorDown },
  { key: "amazon", label: "Amazon Fire TV", note: "Fire Stick, Cube or Fire TV — installs using our Phone or Windows app", icon: Tv },
  { key: "android", label: "Android / Google TV", note: "Android boxes and Google TV — installs using our Phone or Windows app", icon: Tv },
  { key: "alternative", label: "Alternative Install methods", note: "Other ways to get the apps", icon: Download },
  { key: "remote", label: "Help from staff", note: "Let staff install it with you by screen share", icon: Headset },
];

const STAFF_HELP_SUBJECT = "Help installing the apps on my TV";
const STAFF_HELP_MESSAGE = "Hi,\n\nI'd like a member of staff to install the BM apps on my TV for me by screen share. I'm following the Install Guides \"Help from staff\" steps and will complete the Remote setup in this ticket so you can connect.\n\nThank you!";

/** Remote connection screen: staff help the customer install over a ticket-scoped screen share. */
function RemoteHelpSteps() {
  const open = useBusinessOpen();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);

  const createTicket = async () => {
    if (!user || creating) return;
    setCreating(true);
    try {
      const { data: cat } = await supabase.from("ticket_categories").select("id").eq("slug", "general").maybeSingle();
      if (!cat) throw new Error("Could not open the ticket. Please try again.");
      const { data: t, error } = await supabase
        .from("tickets")
        .insert({ ...orderStaffHelpTicket(user.id, cat.id, null), subject: STAFF_HELP_SUBJECT })
        .select("id")
        .single();
      if (error || !t) throw new Error(error?.message ?? "Could not open the ticket. Please try again.");
      const { error: msgErr } = await supabase.from("ticket_messages").insert({
        ticket_id: t.id, sender_id: user.id, content: STAFF_HELP_MESSAGE, is_internal: false,
      });
      if (msgErr) throw new Error(msgErr.message);
      toast.success("Follow the steps to connect your TV");
      await navigate({ to: "/tickets", search: { id: t.id, tab: "setup" } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the ticket. Please try again.");
      setCreating(false);
    }
  };

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Prefer not to do it yourself? Staff can connect to your TV by screen share and install everything for you while you watch.</p>
    <p className="text-sm text-muted-foreground">Open remote setup below. Get your website code there and enter it in BM TV Enabler. Once your TV is ready and connected, your ticket goes to staff.</p>
    <p className="text-sm text-muted-foreground">Staff only see your TV while you're connected, and you can end it at any time.</p>
    {open ? (
      <Button onClick={createTicket} disabled={creating}>
        {creating ? <Loader2 className="size-4 animate-spin" /> : <Headset className="size-4" />}
        {creating ? "Opening ticket…" : "Open a ticket for help"}
      </Button>
    ) : (
      <div className="space-y-2">
        <Button disabled><Headset className="size-4" />Open a ticket for help</Button>
        <p className="text-sm text-muted-foreground">Our office is closed right now, so this is only available during office hours. Try again when we're open and the button will create the ticket for you.</p>
      </div>
    )}
  </div>;
}

export const INSTALL_SETUP_DEVICE_KEY = "install-guides-device";

/** The device the customer picked on the setup screen, restored on reload. */
export function readStoredSetupDevice(): SetupDeviceKey | null {
  try {
    const v = sessionStorage.getItem(INSTALL_SETUP_DEVICE_KEY);
    return v && DEVICES.some((d) => d.key === v) ? (v as SetupDeviceKey) : null;
  } catch {
    return null;
  }
}

function EnablerQr() {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(TV_ENABLER_URL, { width: 320, margin: 1 }).then(setQr).catch(() => setQr(null)); }, []);
  return <div className="space-y-2">
    <h3 className="font-semibold">Android phone</h3>
    <p className="text-sm text-muted-foreground">Scan with your Android phone's camera, then install BM TV Enabler.</p>
    {qr ? <img src={qr} alt="QR code to download BM TV Enabler" width={180} height={180} className="rounded-md bg-card p-2" /> : <div className="size-44 animate-pulse rounded-md bg-muted" />}
    <a href={TV_ENABLER_URL} className="block text-sm text-primary underline">On your phone already? Tap here</a>
  </div>;
}

function SelfInstallEnablerPin() {
  const { user } = useAuth();
  return user ? <AccountEnablerPin userId={user.id} /> : <p className="text-sm text-muted-foreground">Sign in to get your BM TV Enabler PIN.</p>;
}

/** PIN bound to the signed-in account, for customers without a help ticket. */
function AccountEnablerPin({ userId }: { userId: string }) {
  const createFn = useServerFn(createAccountEnablerPin);
  const statusFn = useServerFn(getAccountEnablerPinStatus);
  const create = useCallback(() => createFn(), [createFn]);
  const status = useCallback(() => statusFn(), [statusFn]);
  const revealFn = useServerFn(revealEnablerPin);
  return <EnablerPinBox scopeKey={`account:${userId}`} create={create} status={status} reveal={() => revealFn({ data: {} })} />;
}

/** Self-install answers are passed to the app; staff help uses ticket remote setup. */
function TvSteps({ device, onStaffHelp }: { device: "amazon" | "android"; onStaffHelp: () => void }) {
  const [current, setCurrent] = useState(0);
  const [view, setView] = useState<"steps" | "video">("steps");
  const [apps, setApps] = useState<{ name: string; path: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [done, setDone] = useState<{ apps: string[] } | null>(null);
  const { user } = useAuth();
  const handoffFn = useServerFn(createEnablerHandoff);
  const storageKey = `bm-self-install:${user?.id ?? "signed-out"}:${device}`;

  useEffect(() => {
    setCurrent(0); setCode(null);
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      if (saved && Date.parse(saved.expiresAt) > Date.now()) {
        setCode({ code: saved.code, expiresAt: saved.expiresAt }); setCurrent(2);
      }
    } catch { /* An unavailable saved code never blocks a fresh setup. */ }
  }, [storageKey]);

  const loadApps = useCallback(async () => {
    setLoadError(false); setApps(null);
    try {
      const response = await fetch("/api/public/tv-install-list");
      if (!response.ok) throw new Error("App list unavailable");
      const data: { apps?: { name: string; path: string }[] } = await response.json();
      const list = data.apps ?? [];
      setApps(list); setPicked(new Set(list.map((app) => app.path)));
    } catch { setLoadError(true); setApps([]); }
  }, []);
  useEffect(() => { void loadApps(); }, [loadApps]);

  const makeCode = async () => {
    if (!user || busy || picked.size === 0) return;
    setBusy(true);
    try {
      const result = await handoffFn({ data: selfInstallHandoff(device, [...picked]) });
      setCode(result);
      try { sessionStorage.setItem(storageKey, JSON.stringify(result)); } catch { /* Still show the code. */ }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn't make a code. Try again."); }
    finally { setBusy(false); }
  };

  // Wait for BM TV Enabler to report that this code's install finished.
  useEffect(() => {
    if (!code || done) return;
    let stop = false;
    const check = async () => {
      const { data } = await supabase.from("enabler_handoffs").select("completed_at, completed_apps")
        .eq("code_hash", await sha256Hex(code.code)).maybeSingle();
      if (!stop && data?.completed_at) { setDone({ apps: data.completed_apps ?? [] }); setCurrent(3); }
    };
    void check();
    const timer = setInterval(() => void check(), 5000);
    return () => { stop = true; clearInterval(timer); };
  }, [code, done]);

  const steps = ["Get BM TV Enabler and sign in", "Choose your apps", "Your website code", "All done"];
  return <div className="space-y-5">
    <div className="space-y-3 border-y border-border py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><span className="font-semibold">Step {current + 1} of {steps.length}</span><span className="text-muted-foreground">Self install</span></div>
      <progress aria-label="Self-install progress" value={current + 1} max={steps.length} className="h-2 w-full accent-primary" />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-2" role="tablist" aria-label="Step view">
        <Button role="tab" aria-selected={view === "steps"} size="sm" variant={view === "steps" ? "default" : "outline"} onClick={() => setView("steps")}>Steps</Button>
        <Button role="tab" aria-selected={view === "video"} size="sm" variant={view === "video" ? "default" : "outline"} onClick={() => setView("video")}><PlayCircle className="size-4" />Video tutorial</Button>
      </div>
      <Button variant="outline" size="sm" disabled={busy} onClick={onStaffHelp}><Headset className="size-4" />I need staff help</Button>
    </div>

    {view === "video" && <section aria-label={`Video for step ${current + 1}`} className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">Watch: {steps[current]}</h3>
      <SetupStepVideo step={current} device={device} />
    </section>}
    <section hidden={view !== "steps"} aria-label={`Step ${current + 1}: ${steps[current]}`} className="min-h-44 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{steps[current]}</h3>
      {current === 3 && done && <div className="space-y-4 rounded-lg border border-primary/40 bg-primary/10 p-5 text-center">
        <CheckCircle2 className="mx-auto size-14 text-primary" />
        <p className="text-xl font-semibold text-foreground">Your apps are installed</p>
        <p className="text-sm text-muted-foreground">BM TV Enabler has finished setting up your {device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"}. You can close the app and start watching.</p>
        {done.apps.length > 0 && <ul className="mx-auto max-w-sm space-y-1 text-left text-sm text-foreground">{done.apps.map((a) => <li key={a} className="flex items-center gap-2"><CheckCircle2 className="size-4 text-primary" />{a}</li>)}</ul>}
        <Button variant="outline" onClick={() => { setDone(null); setCode(null); setCurrent(0); try { sessionStorage.removeItem(storageKey); } catch { /* none */ } }}>Set up another TV</Button>
      </div>}
      {current === 0 && <>
        <p className="text-sm text-muted-foreground">Install BM TV Enabler on your Android phone or Windows PC, using the same Wi-Fi as your TV. Sign in with the PIN below the phone QR code.</p>
        <div className="xl:hidden"><EnablerDownloadSidebar /></div>
      </>}
      {current === 1 && <div className="space-y-2">
        <p className="text-sm text-muted-foreground">All apps are ticked. Untick any you don't want. BM TV Enabler checks your TV and skips apps already installed.</p>
        {loadError ? <div className="space-y-2"><p className="text-sm text-destructive">Couldn't load the apps.</p><Button variant="outline" onClick={() => void loadApps()}>Try again</Button></div>
          : !apps ? <Loader2 aria-label="Loading apps" className="size-6 animate-spin" />
          : apps.length === 0 ? <p className="text-sm text-muted-foreground">No apps are available to install right now.</p>
          : <AppPickCards apps={apps} picked={picked} onToggle={(path, on) => {
              setPicked((previous) => { const next = new Set(previous); if (on) next.add(path); else next.delete(path); return next; });
              setCode(null); try { sessionStorage.removeItem(storageKey); } catch { /* No saved code. */ }
            }} />}
      </div>}
      {current === 2 && (code ? <div className="space-y-3">
        <p className="select-all break-all font-mono text-4xl font-bold text-primary">{code.code.slice(0, 3)}-{code.code.slice(3)}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>In BM TV Enabler select <strong className="text-foreground">I have a website code</strong> and enter this code.</li>
          <li>Follow the TV connection steps and approve the debugging prompt on your TV.</li>
          <li>BM TV Enabler installs only your ticked apps, skipping those already installed.</li>
        </ol>
        <p className="text-sm text-muted-foreground">When it finishes, your install is recorded. No screen sharing or support ticket is needed.</p>
        <Button variant="outline" disabled={busy} onClick={() => { setCode(null); try { sessionStorage.removeItem(storageKey); } catch { /* none */ } void makeCode(); }}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Problem? Get a new code</Button>
        <p className="text-xs text-muted-foreground">Use once, before {new Date(code.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} (valid for 2 hours).</p>
      </div> : <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Get a code for your {device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"} and {picked.size} selected {picked.size === 1 ? "app" : "apps"}.</p>
        <Button onClick={makeCode} disabled={busy || !user || picked.size === 0}>{busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Get my website code</Button>
      </div>)}
    </section>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
      <Button variant="outline" disabled={current === 0 || busy} onClick={() => setCurrent(current - 1)}><ArrowLeft className="size-4" />Back</Button>
      {current < 2 && <Button disabled={busy || (current === 1 && (!apps || loadError || picked.size === 0))} onClick={() => setCurrent(current + 1)}>Next<ArrowRight className="size-4" /></Button>}
    </div>
  </div>;
}


/** Shared phone and Windows columns for TV self-install and staff help. */
export function EnablerDownloadSidebar() {
  return <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
    <div className="min-w-0 space-y-4 rounded-lg border border-border bg-surface/70 p-4">
      <EnablerQr />
      <SelfInstallEnablerPin />
    </div>
    <div className="min-w-0 rounded-lg border border-border bg-surface/70 p-4">
      <WindowsEnablerDownload />
    </div>
  </div>;
}

/** "What are you setting up?" — device picker that leads into the matching setup. */
export function DeviceInstallSetup({ alternative, device, onPick, section = "direct" }: {
  alternative?: ReactNode;
  device: SetupDeviceKey | null;
  onPick: (d: SetupDeviceKey | null) => void;
  section?: "direct" | "enabler";
}) {
  const showAlternative = useAlternativeInstallEnabled();
  const devices = DEVICES.filter((d) =>
    (section === "enabler" ? ["amazon", "android", "remote"].includes(d.key) : ["direct", "alternative"].includes(d.key))
    && (d.key !== "alternative" || showAlternative));
  const chosen = devices.find((d) => d.key === device);
  // The Direct tab goes straight into the wizard — the device choice moved to its own tabs.
  // The picker only returns when the admin Alternative-methods toggle is switched on.
  const directBypass = section === "direct" && (!showAlternative || chosen?.key === "direct");

  return <div className="w-full space-y-6">
    <div className="rounded-lg border border-border bg-surface/70 p-5 sm:p-7">
      {directBypass ? <>
        <div className="mb-4">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground"><MonitorDown className="size-6 text-primary" />BM Direct Install</h2>
        </div>
        <DirectInstallSteps />
      </> : !chosen ? <>
        <h2 className="font-display text-2xl font-bold text-foreground">What are you setting up?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick your device and we'll walk you through it one step at a time.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-6">
          {devices.map(({ key, label, note, icon: Icon }) => (
            <Button key={key} variant="outline" onClick={() => onPick(key)} className="h-auto flex-col items-start gap-2 whitespace-normal p-4 text-left">
              <Icon className="size-6 text-primary" />
              <span className="font-semibold text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </Button>
          ))}
        </div>
      </> : <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground"><chosen.icon className="size-6 text-primary" />{chosen.label}</h2>
          <Button variant="outline" size="sm" onClick={() => onPick(null)}><ArrowLeft className="size-4" />{chosen.key === "remote" ? "Return to Self Install" : "Change device"}</Button>
        </div>
        {chosen.key === "amazon" || chosen.key === "android"
          ? <TvSteps device={chosen.key} onStaffHelp={() => onPick("remote")} />
          : chosen.key === "direct" ? <DirectInstallSteps />
          : chosen.key === "remote" ? <><RemoteHelpSteps /><div className="mt-5 xl:hidden"><EnablerDownloadSidebar /></div></> : alternative}
      </>}
    </div>
  </div>;
}

import { useCallback, useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Download, Headset, KeyRound, Loader2, Tv } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TV_ENABLER_URL } from "@/components/app/TvEnablerPanel";
import { WindowsEnablerDownload } from "@/components/app/WindowsEnablerDownload";
import { EnablerPinBox } from "@/components/app/EnablerPinBox";
import { createTicketEnablerPin, revealEnablerPin, createAccountEnablerPin, getAccountEnablerPinStatus, getTicketEnablerPinStatus } from "@/lib/enabler-pin.functions";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessOpen } from "@/hooks/use-business-open";
import { supabase } from "@/integrations/supabase/client";
import { sendNewTicketPush } from "@/lib/push.functions";
import { createEnablerHandoff } from "@/lib/enabler-handoff.functions";

export type SetupDeviceKey = "amazon" | "android" | "alternative" | "remote";

const DEVICES: { key: SetupDeviceKey; label: string; note: string; icon: typeof Tv }[] = [
  { key: "amazon", label: "Amazon Fire TV", note: "Fire Stick, Cube or Fire TV", icon: Tv },
  { key: "android", label: "Android / Google TV", note: "Android boxes and Google TV", icon: Tv },
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
  const notifyNewTicket = useServerFn(sendNewTicketPush);

  const createTicket = async () => {
    if (!user || creating) return;
    setCreating(true);
    try {
      const { data: cat } = await supabase.from("ticket_categories").select("id").eq("slug", "general").maybeSingle();
      if (!cat) throw new Error("Could not open the ticket. Please try again.");
      const { data: t, error } = await supabase
        .from("tickets")
        .insert({ user_id: user.id, subject: STAFF_HELP_SUBJECT, category_id: cat.id, priority: "normal" })
        .select("id")
        .single();
      if (error || !t) throw new Error(error?.message ?? "Could not open the ticket. Please try again.");
      const { error: msgErr } = await supabase.from("ticket_messages").insert({
        ticket_id: t.id, sender_id: user.id, content: STAFF_HELP_MESSAGE, is_internal: false,
      });
      if (msgErr) throw new Error(msgErr.message);
      // Fire-and-forget staff push, same as the New ticket form.
      void notifyNewTicket({ data: { ticketId: t.id, subject: STAFF_HELP_SUBJECT, categorySlug: "general" } })
        .catch((e) => console.error("[install-guides] new ticket push failed", e));
      toast.success("Ticket opened");
      await navigate({ to: "/tickets", search: { id: t.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the ticket. Please try again.");
      setCreating(false);
    }
  };

  const steps = [
    <>Press <strong className="text-foreground">Open a ticket for help</strong> below — it creates the ticket for you and opens it straight away (only while our office is open).</>,
    <>In the ticket open the <strong className="text-foreground">Remote setup</strong> tab and follow its steps with BM TV Enabler on your Android phone or Windows PC.</>,
    <>In the Enabler choose <strong className="text-foreground">Screen-share support</strong>, find your TV and press <strong className="text-foreground">Allow</strong> on the TV.</>,
    <>Type the Enabler reference into the ticket. A member of staff will then connect, see your TV screen and install the apps with you.</>,
  ];
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Prefer not to do it yourself? Staff can connect to your TV by screen share and install everything for you while you watch.</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    <p className="text-sm text-muted-foreground">Staff only see your TV while you're connected, and you can end it at any time.</p>
    <div className="grid gap-6 sm:grid-cols-2 xl:hidden">
      <div className="space-y-3"><EnablerQr /><StaffHelpEnablerPin /></div>
      <WindowsEnablerDownload />
    </div>
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

const DEBUGGING: Record<"amazon" | "android", string[]> = {
  amazon: [
    "On the Fire TV open Settings › My Fire TV › About.",
    "Press the device name 7 times until it says you are a developer.",
    "Go back to My Fire TV › Developer options and switch ADB debugging ON.",
  ],
  android: [
    "On the TV open Settings › System › About.",
    "Press Android TV OS build 7 times until it says you are a developer.",
    "Go back to System › Developer options and switch Network debugging ON (or Wireless debugging if your TV has that instead).",
  ],
};

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

/** The BM TV Enabler PIN button, bound to the customer's most recent staff-help ticket. */
function StaffHelpEnablerPin() {
  const { user } = useAuth();
  const [ticketId, setTicketId] = useState<string | null | undefined>(undefined);
  const createFn = useServerFn(createTicketEnablerPin);
  const statusFn = useServerFn(getTicketEnablerPinStatus);
  useEffect(() => {
    let stopped = false;
    (async () => {
      if (!user) { if (!stopped) setTicketId(null); return; }
      const { data } = await supabase.from("tickets").select("id").eq("user_id", user.id)
        .eq("subject", STAFF_HELP_SUBJECT).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!stopped) setTicketId(data?.id ?? null);
    })();
    return () => { stopped = true; };
  }, [user]);
  const create = useCallback(() => {
    if (!ticketId) throw new Error("Open a help ticket first to request your PIN.");
    return createFn({ data: { ticketId } });
  }, [createFn, ticketId]);
  const revealFn = useServerFn(revealEnablerPin);
  const status = useCallback(() => {
    if (!ticketId) return Promise.resolve({ expires_at: null });
    return statusFn({ data: { ticketId } });
  }, [statusFn, ticketId]);
  if (ticketId === undefined) return <div className="h-28 animate-pulse rounded-md bg-muted" />;
  if (!ticketId) return user ? <AccountEnablerPin userId={user.id} /> : <div className="space-y-2">
    <Button disabled className="w-full whitespace-normal"><KeyRound className="size-4 shrink-0" />Get BM TV Enabler PIN</Button>
    <p className="text-xs text-muted-foreground">Sign in to get your BM TV Enabler PIN.</p>
  </div>;
  return <EnablerPinBox scopeKey={`ticket:${ticketId}`} create={create} status={status} reveal={() => revealFn({ data: { ticketId } })} />;
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

/** One-step-at-a-time Enabler setup for a TV: questions answered here, then a code hands them to BM TV Enabler. */
function TvSteps({ device }: { device: "amazon" | "android" }) {
  const [current, setCurrent] = useState(0);
  const [helpPlan, setHelpPlan] = useState<0 | 1 | 2>(0);
  const [apps, setApps] = useState<{ name: string; path: string }[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const open = useBusinessOpen();
  const { user } = useAuth();
  const handoffFn = useServerFn(createEnablerHandoff);
  const notifyNewTicket = useServerFn(sendNewTicketPush);
  useEffect(() => { setCurrent(0); setHelpPlan(0); setCode(null); }, [device]);
  useEffect(() => {
    if (helpPlan !== 2 || apps) return;
    fetch("/api/public/tv-install-list").then((r) => r.json()).then((d: { apps?: { name: string; path: string }[] }) => {
      const list = d.apps ?? []; setApps(list); setPicked(new Set(list.map((a) => a.path)));
    }).catch(() => setApps([]));
  }, [helpPlan, apps]);

  const makeCode = async () => {
    if (!user || busy) return;
    setBusy(true);
    try {
      let ticketId: string | null = null;
      if (helpPlan === 1) {
        const { data: cat } = await supabase.from("ticket_categories").select("id").eq("slug", "general").maybeSingle();
        if (!cat) throw new Error("Could not open the ticket. Please try again.");
        const subject = "Help installing apps on my TV (BM TV Enabler)";
        const { data: t, error } = await supabase.from("tickets").insert({ user_id: user.id, subject, category_id: cat.id, priority: "normal" }).select("id").single();
        if (error || !t) throw new Error("Could not open the ticket. Please try again.");
        await supabase.from("ticket_messages").insert({ ticket_id: t.id, sender_id: user.id, is_internal: false,
          content: `Hi,\n\nI'd like a member of staff to install the BM apps on my ${device === "amazon" ? "Amazon Fire TV" : "Android / Google TV"} by screen share. I'm setting up screen sharing with BM TV Enabler now.\n\nThank you!` });
        void notifyNewTicket({ data: { ticketId: t.id, subject, categorySlug: "general" } }).catch(() => {});
        ticketId = t.id;
      }
      setCode(await handoffFn({ data: { device, helpPlan: helpPlan as 1 | 2, appPaths: helpPlan === 2 ? [...picked] : [], ticketId } }));
      setCurrent(steps.length - 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make a code. Try again."); }
    finally { setBusy(false); }
  };

  const choice = (plan: 1 | 2, title: string, text: string, disabled = false) => (
    <button type="button" disabled={disabled} onClick={() => { setHelpPlan(plan); setCode(null); }}
      className={`flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition disabled:opacity-50 ${helpPlan === plan ? "border-primary bg-primary/10" : "border-border bg-surface-2 hover:border-primary"}`}>
      <span className="font-semibold text-foreground">{title}</span><span className="text-xs text-muted-foreground">{text}</span>
    </button>
  );

  const steps: { title: string; body: ReactNode; ready?: boolean }[] = [
    {
      title: "Get BM TV Enabler",
      body: <p className="text-sm text-muted-foreground">BM TV Enabler sets up your TV for you. Use it on an Android phone or a Windows PC on the same Wi-Fi as the TV. When it opens, type your BM TV Enabler access PIN.</p>,
    },
    {
      title: "Do you need help from our staff?",
      ready: helpPlan !== 0,
      body: <div className="grid gap-3 sm:grid-cols-2">
        {choice(1, "Yes — I need staff help", open ? "We open a ticket now. BM TV Enabler sets up screen sharing and our staff install the apps for you." : "Only available during office hours.", !open)}
        {choice(2, "No — I'll install myself", "You choose the apps and BM TV Enabler installs them.")}
      </div>,
    },
    ...(helpPlan === 2 ? [{
      title: "Choose your apps",
      ready: picked.size > 0,
      body: !apps ? <div className="h-24 animate-pulse rounded-md bg-muted" /> : <div className="space-y-2">
        <p className="text-sm text-muted-foreground">All apps are ticked. Untick any you don't want. Apps already on your TV are skipped automatically.</p>
        {apps.map((a) => <label key={a.path} className="flex items-center gap-3 rounded-md border border-border bg-surface-2 p-3 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={picked.has(a.path)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(a.path); else n.delete(a.path); return n; })} />
          <span className="text-foreground">{a.name}</span>
        </label>)}
      </div>,
    }] : []),
    {
      title: "Your BM TV Enabler code",
      body: code ? <div className="space-y-3">
        <p className="font-mono text-4xl font-bold tracking-widest text-primary">{code.code.slice(0, 3)}-{code.code.slice(3)}</p>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>In BM TV Enabler press <strong className="text-foreground">I have a website code</strong> and type this code.</li>
          <li>Follow the app to switch on debugging, find your TV and press <strong className="text-foreground">Allow</strong> on the TV.</li>
          <li>{helpPlan === 1 ? "The app sets up screen sharing on your ticket. Our staff then connect and install the apps for you." : "The app installs your ticked apps and skips any already on your TV."}</li>
        </ol>
        <p className="text-xs text-muted-foreground">Works once, for 2 hours (until {new Date(code.expiresAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}).</p>
      </div> : <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{helpPlan === 1 ? "We'll open your help ticket and give you a code for BM TV Enabler." : "We'll give you a code that tells BM TV Enabler which apps to install."}</p>
        <Button onClick={makeCode} disabled={busy || !user || (helpPlan === 1 && !open)}>{busy && <Loader2 className="size-4 animate-spin" />}Get my code</Button>
      </div>,
    },
  ];
  const step = steps[Math.min(current, steps.length - 1)];
  if (!step) return null;
  const idx = Math.min(current, steps.length - 1);
  return <div className="space-y-5">
    <div className="space-y-3 border-y border-border py-4">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold">Step {idx + 1} of {steps.length}</span><span className="text-muted-foreground">{step.title}</span></div>
      <progress aria-label="Setup progress" value={idx + 1} max={steps.length} className="h-2 w-full accent-primary" />
    </div>
    <section aria-label={`Step ${idx + 1}: ${step.title}`} className="min-h-44 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
      {step.body}
    </section>
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <Button variant="outline" disabled={idx === 0 || busy} onClick={() => setCurrent(Math.max(0, idx - 1))}><ArrowLeft className="size-4" />Back</Button>
      {idx < steps.length - 1 && <Button disabled={step.ready === false} onClick={() => setCurrent(idx + 1)}>Next<ArrowRight className="size-4" /></Button>}
    </div>
  </div>;
}

/** Shared phone and Windows columns for TV self-install and staff help. */
export function EnablerDownloadSidebar() {
  return <div className="grid min-w-0 gap-4 2xl:grid-cols-2">
    <div className="min-w-0 space-y-4 rounded-lg border border-border bg-surface/70 p-4">
      <EnablerQr />
      <StaffHelpEnablerPin />
    </div>
    <div className="min-w-0 rounded-lg border border-border bg-surface/70 p-4">
      <WindowsEnablerDownload />
    </div>
  </div>;
}

/** "What are you setting up?" — device picker that leads into the matching setup. */
export function DeviceInstallSetup({ alternative, device, onPick }: {
  alternative: ReactNode;
  device: SetupDeviceKey | null;
  onPick: (d: SetupDeviceKey | null) => void;
}) {
  const chosen = DEVICES.find((d) => d.key === device);

  return <div className="w-full space-y-6">
    <div className="rounded-lg border border-border bg-surface/70 p-5 sm:p-7">
      {!chosen ? <>
        <h2 className="font-display text-2xl font-bold text-foreground">What are you setting up?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Pick your device and we'll walk you through it one step at a time.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DEVICES.map(({ key, label, note, icon: Icon }) => (
            <button key={key} type="button" onClick={() => onPick(key)} className="flex flex-col items-start gap-2 rounded-lg border border-border bg-surface-2 p-4 text-left transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Icon className="size-6 text-primary" />
              <span className="font-semibold text-foreground">{label}</span>
              <span className="text-xs text-muted-foreground">{note}</span>
            </button>
          ))}
        </div>
      </> : <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground"><chosen.icon className="size-6 text-primary" />{chosen.label}</h2>
          <Button variant="outline" size="sm" onClick={() => onPick(null)}><ArrowLeft className="size-4" />{chosen.key === "remote" ? "Return to Self Install" : "Change device"}</Button>
        </div>
        {chosen.key === "amazon" || chosen.key === "android"
          ? <div className="space-y-6"><TvSteps device={chosen.key} /><div className="xl:hidden"><EnablerDownloadSidebar /></div></div>
          : chosen.key === "remote" ? <RemoteHelpSteps /> : alternative}
      </>}
    </div>
  </div>;
}

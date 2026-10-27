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
    <>In the Enabler choose <strong className="text-foreground">Start a screen share</strong>, find your TV and press <strong className="text-foreground">Allow</strong> on the TV.</>,
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

/** One-step-at-a-time Enabler setup for a TV. */
function TvSteps({ device }: { device: "amazon" | "android" }) {
  const [current, setCurrent] = useState(0);
  useEffect(() => setCurrent(0), [device]);
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: "Get BM TV Enabler",
      body: <div className="space-y-4">
        <p className="text-sm text-muted-foreground">BM TV Enabler installs the BM apps on your TV for you. Use it on an Android phone or a Windows PC on the same Wi-Fi as the TV. When it opens, type your BM TV Enabler access PIN.</p>
      </div>,
    },
    {
      title: "Switch on TV debugging",
      body: <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">{DEBUGGING[device].map((s) => <li key={s}>{s}</li>)}<li>Keep the TV and your phone or PC on the same home Wi-Fi (not guest Wi-Fi, no VPN).</li></ol>,
    },
    {
      title: "Install the apps",
      body: <div className="space-y-3">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>In BM TV Enabler choose <strong className="text-foreground">Install apps</strong>.</li>
          <li>Press <strong className="text-foreground">Find my TV</strong> and pick your TV.</li>
          <li>On the TV tick <strong className="text-foreground">Always allow</strong> and press <strong className="text-foreground">Allow</strong>.</li>
          <li>The Enabler installs each BM app and skips any already on your TV, then lists what it did.</li>
        </ol>
        <p className="text-sm text-muted-foreground">Once they're on your TV, the <strong className="text-foreground">Guides</strong> tab shows how to use each app.</p>
      </div>,
    },
  ];
  const step = steps[current];
  if (!step) return null;
  return <div className="space-y-5">
    <div className="space-y-3 border-y border-border py-4">
      <div className="flex items-center justify-between text-sm"><span className="font-semibold">Step {current + 1} of {steps.length}</span><span className="text-muted-foreground">{step.title}</span></div>
      <progress aria-label="Setup progress" value={current + 1} max={steps.length} className="h-2 w-full accent-primary" />
    </div>
    <section aria-label={`Step ${current + 1}: ${step.title}`} className="min-h-44 space-y-4">
      <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
      {step.body}
    </section>
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <Button variant="outline" disabled={current === 0} onClick={() => setCurrent((v) => Math.max(0, v - 1))}><ArrowLeft className="size-4" />Back</Button>
      {current < steps.length - 1 && <Button onClick={() => setCurrent((v) => v + 1)}>Next<ArrowRight className="size-4" /></Button>}
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

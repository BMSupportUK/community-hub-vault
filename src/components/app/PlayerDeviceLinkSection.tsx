import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { devicesForPlayerLogin, manualPlayerLogin, selectedPlayerLogin, type SavedPlayerLogin } from "./player-login-selection";
import { usePlayerDevices, type PlayerDevice } from "@/hooks/use-player-devices";
import { useCustomerNumber, useLoginPlayerNumbers } from "@/components/app/CustomerNumber";
import { useServerFn } from "@tanstack/react-start";
import { Laptop, Loader2, Send, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPlayerSigninCode, notMePlayerDevice, sendLoginToDevice, sendLoginWithCode } from "@/lib/player.functions";

const platformLabel: Record<string, string> = { android: "Android TV", firetv: "Fire TV", phone: "Android phone", windows: "Windows PC", mac: "Mac", web: "iPhone / iPad browser" };

// Readable device name: fall back to the device type when the stored name is a model code or blank.
function readableName(d: PlayerDevice) {
  const kind = platformLabel[d.platform] ?? "BM Player device";
  const n = (d.name ?? "").trim();
  if (!n || /^[A-Z0-9_-]{2,}$/.test(n) || /^[0-9a-f-]{12,}$/i.test(n) || n.toLowerCase() === d.platform) return kind;
  return n;
}
const isOn = (d: PlayerDevice) => Date.now() - new Date(d.last_seen_at).getTime() < 3 * 60_000;

export function PlayerDeviceLinkSection() {
  const sendCode = useServerFn(sendLoginWithCode);
  const sendDevice = useServerFn(sendLoginToDevice);
  const notMeFn = useServerFn(notMePlayerDevice);
  const makeSigninCode = useServerFn(createPlayerSigninCode);
  const [signin, setSignin] = useState<{ code: string; expiresAt: number } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => { if (!signin) return; const t = setInterval(() => setNowTick(Date.now()), 1000); return () => clearInterval(t); }, [signin]);
  const { devices, reload } = usePlayerDevices();
  const { user } = useAuth();
  const ownerId = user?.id;
  const customerNumber = useCustomerNumber(ownerId);
  const loginNumbers = useLoginPlayerNumbers(ownerId);
  const { data: accounts = [], isPending: loadingAccounts, isError: accountsFailed, refetch } = useQuery({
    queryKey: ["player-saved-logins", ownerId],
    enabled: Boolean(ownerId),
    queryFn: async () => {
      if (!ownerId) return [];
      const { data, error } = await supabase.from("app_credentials")
        .select("id,app_login_name,password,expiry_at,account_type,account_number")
        .eq("owner_id", ownerId).order("account_number", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SavedPlayerLogin[];
    },
    gcTime: 0,
  });
  const [selection, setSelection] = useState<{ ownerId: string; id: string } | null>(null);
  const selectedId = selection && selection.ownerId === ownerId && accounts.some((account) => account.id === selection.id) ? selection.id : accounts[0]?.id ?? null;
  const activeAccount = accounts.find((account) => account.id === selectedId);
  const activeNumber = activeAccount ? loginNumbers.find((row) => row.credential_id === activeAccount.id)?.number ?? (accounts.length === 1 ? customerNumber : null) : customerNumber;
  const visibleDevices = activeAccount ? devicesForPlayerLogin(devices, activeAccount) : accounts.length === 0 ? devices : [];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [target, setTarget] = useState<PlayerDevice | null>(null);
  const [manual, setManual] = useState({ username: "", password: "" });
  // Nothing saved on the account: let the subscriber type their login in instead.
  const typeItIn = !loadingAccounts && !accountsFailed && accounts.length === 0;
  const login = typeItIn ? manualPlayerLogin(manual.username, manual.password) : selectedPlayerLogin(accounts, selectedId);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!target && !/^\d{6}$/.test(code)) { setError("Enter the 6-digit code shown on your screen."); return; }
    if (!login) { setError(typeItIn ? "Enter your app login and password." : "Tick the app login you want to send."); return; }
    setBusy(true);
    try {
      const r = target ? await sendDevice({ data: { deviceId: target.id, ...login } }) : await sendCode({ data: { code, ...login } });
      if (r?.held) toast.info("This login is already on 3 boxes. BM Support will approve the new box shortly.");
      else toast.success("Sent! Your app will sign in within a few seconds.");
      setCode(""); setTarget(null); setManual({ username: "", password: "" }); void reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }

  // Device Send goes straight to that device with the ticked login (or the only login).
  async function sendToDevice(d: PlayerDevice) {
    setError("");
    const usable = accounts.filter((a) => a.app_login_name && a.password);
    const pick = login ?? (usable.length === 1 ? selectedPlayerLogin(usable, usable[0].id) : null);
    if (!pick) { setError(typeItIn ? "Enter your app login and password first." : "Tick the app login you want to send, then press Send on the device."); return; }
    setBusy(true);
    try {
      const r = await sendDevice({ data: { deviceId: d.id, ...pick } });
      if (r?.held) toast.info("This login is already on 3 boxes. BM Support will approve this box shortly.");
      else toast.success(`Sent to ${d.name}. It will sign in within a few seconds.`);
      setManual({ username: "", password: "" }); void reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }

  async function showSigninCode() {
    setError("");
    if (!login) { setError(typeItIn ? "Enter your app login and password first." : "Tick the app login for this device first."); return; }
    setBusy(true);
    try { const r = await makeSigninCode({ data: login }); setSignin({ code: r.code, expiresAt: Date.parse(r.expiresAt) }); }
    catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }
  const signinLeft = signin ? Math.max(0, Math.ceil((signin.expiresAt - nowTick) / 1000)) : 0;

  async function notMe(d: PlayerDevice) {
    if (!window.confirm(`Remove ${d.name} and tell BM Support it isn't yours?`)) return;
    try { await notMeFn({ data: { deviceId: d.id } }); toast.success(`${d.name} removed. BM Support has been told.`); void reload(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Please try again."); }
  }

  async function remove(d: PlayerDevice) {
    const { error } = await supabase.from("player_devices").delete().eq("id", d.id);
    if (error) toast.error(error.message); else { toast.success(`${d.name} removed`); void reload(); }
  }

  return <section className="min-w-0 text-foreground">
    <div className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-primary/30 bg-background/40 p-6 shadow-2xl backdrop-blur-md">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-foreground"><Tv className="size-3.5" />BM Player</span>
        <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Link Device</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">Signing in a new device? Choose the app login below, press Show my sign-in code, then type that code into BM Player. Linked devices stay signed in.</p>
      </div>
      {accounts.length > 1 && <Tabs value={selectedId ?? ""} onValueChange={(id) => { if (ownerId) setSelection({ ownerId, id }); setCode(""); setTarget(null); setError(""); }} className="mt-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2">
          {accounts.map((account) => <TabsTrigger key={account.id} value={account.id} disabled={busy} className="min-w-0 whitespace-normal text-left">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="break-all">{account.app_login_name || `Account ${account.account_number}`}</span>
              {loginNumbers.find((row) => row.credential_id === account.id)?.number && <span className="font-mono">#{loginNumbers.find((row) => row.credential_id === account.id)?.number}</span>}
            </span>
          </TabsTrigger>)}
        </TabsList>
      </Tabs>}
      <div className="mt-6 rounded-2xl border border-primary/40 bg-background/55 p-6 shadow-2xl backdrop-blur-md">
        <h3 className="text-base font-semibold">Your BM Player sign-in code</h3>
        <p className="mt-1 text-sm text-muted-foreground">In BM Player answer <strong>Yes</strong> to “Do you have a BM Support website account?” and type this code. It works once and lasts 10 minutes. It signs in with the app login ticked below.</p>
        {signin && signinLeft > 0 ? <div className="mt-4 flex flex-wrap items-center gap-4">
          <span aria-label="Sign-in code" className="rounded-xl border border-primary/50 bg-primary/15 px-6 py-3 font-mono text-4xl font-bold tracking-[0.3em]">{signin.code.slice(0, 3)} {signin.code.slice(3)}</span>
          <span className="text-sm text-muted-foreground">Runs out in {Math.floor(signinLeft / 60)}:{String(signinLeft % 60).padStart(2, "0")}</span>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void showSigninCode()}>New code</Button>
        </div> : <Button type="button" className="mt-4" disabled={busy || loadingAccounts} onClick={() => void showSigninCode()}>{busy ? <Loader2 className="animate-spin" /> : null}Show my sign-in code</Button>}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <form onSubmit={submit} className="space-y-5 rounded-2xl border border-primary/30 bg-background/55 p-6 shadow-2xl backdrop-blur-md">
          {target ? <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
            <span>Sending to <strong>{target.name}</strong></span>
            <Button type="button" variant="link" size="sm" onClick={() => setTarget(null)}>Use a code instead</Button>
          </div> : <div className="space-y-1.5">
            <Label htmlFor="player-code" className="text-base font-semibold">Older BM Player showing a code?</Label>
            <p className="text-xs text-muted-foreground">Type the 6-digit code shown on your TV, phone or computer.</p>
            <Input id="player-code" inputMode="numeric" autoComplete="off" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="h-16 border-primary/40 bg-background/60 text-center font-mono text-3xl tracking-[0.6em]" />
          </div>}
          <fieldset className="min-w-0 space-y-3" disabled={busy}>
            <legend className="mb-2 text-sm font-semibold">{typeItIn ? "Your app login" : "Your saved app logins"}</legend>
            {loadingAccounts ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Loading your logins…</p>
              : accountsFailed ? <div role="alert" className="text-sm text-destructive">Your logins could not be loaded. <Button type="button" variant="link" size="sm" onClick={() => void refetch()}>Try again</Button></div>
              : typeItIn ? <div className="space-y-3">
                <p className="text-sm text-muted-foreground">No app logins are saved on your account yet, so type in the login your app uses.</p>
                <div className="space-y-1.5">
                  <Label htmlFor="player-manual-login">App login</Label>
                  <Input id="player-manual-login" autoComplete="off" value={manual.username}
                    onChange={(e) => setManual((m) => ({ ...m, username: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="player-manual-password">Password</Label>
                  <Input id="player-manual-password" type="password" autoComplete="off" value={manual.password}
                    onChange={(e) => setManual((m) => ({ ...m, password: e.target.value }))} />
                </div>
              </div>
              : accounts.filter((account) => account.id === selectedId).map((account) => <div key={account.id} className="flex min-w-0 items-start gap-3 rounded-xl border border-border bg-background/50 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Account {account.account_number} · {account.account_type === "multi" ? "Multi-room" : account.account_type === "triple" ? "Triple-room" : "Single account"}</span>
                  <span className="block break-all font-mono text-sm">{account.app_login_name}</span>
                  <span className="block text-xs text-muted-foreground">{account.expiry_at ? `Expiry: ${new Date(account.expiry_at).toLocaleDateString("en-GB")}` : "No expiry"}</span>
                </span>
              </div>)}
          </fieldset>
          <Button type="submit" size="lg" className="h-12 w-full text-base shadow-lg" disabled={busy || loadingAccounts || !login || (!target && code.length !== 6)}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Link this device</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">You only do this once per device. Your login goes straight to the app and is then deleted from our side.</p>
        </form>
        <aside className="rounded-2xl border border-primary/30 bg-background/55 p-6 shadow-2xl backdrop-blur-md">
          {/* Account number sits opposite the heading so it is readable at a glance. */}
          <div className="flex flex-nowrap items-center justify-between gap-2">
            <h2 className="min-w-0 truncate font-display font-semibold">My linked devices</h2>
            {activeNumber ? <span className="inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-full border border-primary/50 bg-primary/25 px-2.5 py-1 text-primary-foreground" title="BM Player account number">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-primary-foreground/70">Account no.</span>
              <span className="font-mono text-base font-bold leading-none tracking-[0.1em]">{activeNumber}</span>
            </span> : null}
          </div>
          {visibleDevices.length ? <ul className="mt-3 space-y-3">{visibleDevices.map((d) => <li key={d.id} className="rounded-xl border border-border bg-background/50 p-3 transition-colors hover:border-primary/50">
            <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary">{d.platform === "windows" || d.platform === "mac" ? <Laptop className="size-5" /> : <Tv className="size-5" />}</span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-semibold">{readableName(d)}</div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className={`size-2 rounded-full ${isOn(d) ? "bg-success" : "bg-muted-foreground/50"}`} />{isOn(d) ? "On" : "Off"} · {platformLabel[d.platform] ?? d.platform}</div></div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
            <Button size="sm" disabled={busy} variant="secondary" title="Only needed if the app has lost its login" onClick={() => void sendToDevice(d)}>Resend login</Button>
            <Button size="sm" variant="outline" disabled={busy} title="This box isn't mine" onClick={() => void notMe(d)}>Not me</Button>
            <Button size="icon" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => void remove(d)}><Trash2 /></Button>
            </div>
          </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No devices yet. Open BM Player on your device and enter the 6-digit code it shows above.</p>}
        </aside>
      </div>
    </div>
  </section>;
}

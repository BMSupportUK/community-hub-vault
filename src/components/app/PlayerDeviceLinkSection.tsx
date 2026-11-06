import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { isAppleMobile } from "@/lib/player-web";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Checkbox } from "@/components/ui/checkbox";
import { manualPlayerLogin, selectedPlayerLogin, type SavedPlayerLogin } from "./player-login-selection";
import { usePlayerDevices, type PlayerDevice } from "@/hooks/use-player-devices";
import { useCustomerNumber } from "@/components/app/CustomerNumber";
import { useServerFn } from "@tanstack/react-start";
import { Laptop, Loader2, Send, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendLoginToDevice, sendLoginWithCode } from "@/lib/player.functions";

const platformLabel: Record<string, string> = { android: "Android TV", firetv: "Fire TV", phone: "Android phone", windows: "Windows PC", mac: "Mac", web: "iPhone / iPad browser" };

export function PlayerDeviceLinkSection() {
  const sendCode = useServerFn(sendLoginWithCode);
  const sendDevice = useServerFn(sendLoginToDevice);
  const { devices, reload } = usePlayerDevices();
  const { user } = useAuth();
  const ownerId = user?.id;
  const customerNumber = useCustomerNumber(ownerId);
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
  const selectedId = selection?.ownerId === ownerId ? selection?.id ?? null : null;
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
      if (target) await sendDevice({ data: { deviceId: target.id, ...login } });
      else await sendCode({ data: { code, ...login } });
      toast.success("Sent! Your app will sign in within a few seconds.");
      setCode(""); setSelection(null); setTarget(null); setManual({ username: "", password: "" }); void reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Please try again."); }
    finally { setBusy(false); }
  }

  async function remove(d: PlayerDevice) {
    const { error } = await supabase.from("player_devices").delete().eq("id", d.id);
    if (error) toast.error(error.message); else { toast.success(`${d.name} removed`); void reload(); }
  }

  return <section className="min-w-0 text-foreground">
    <div className="mx-auto max-w-5xl">
      <h2 className="font-display text-2xl font-bold">Link Device</h2>
      <p className="mt-1 text-sm text-muted-foreground">Enter the code shown on your TV, phone or PC to sign the BM Player app in.</p>
      <AppleWebPlayerLink />
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface/90 p-5">
          {target ? <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
            <span>Sending to <strong>{target.name}</strong></span>
            <Button type="button" variant="link" size="sm" onClick={() => setTarget(null)}>Use a code instead</Button>
          </div> : <div className="space-y-1.5">
            <Label htmlFor="player-code">6-digit code on your screen</Label>
            <Input id="player-code" inputMode="numeric" autoComplete="off" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="font-mono text-lg tracking-[0.4em]" />
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
              : accounts.map((account) => <label key={account.id} className="flex min-w-0 cursor-pointer items-start gap-3 border-b border-border py-3 last:border-b-0">
                <Checkbox className="mt-1" checked={selectedId === account.id} disabled={!account.app_login_name || !account.password}
                  onCheckedChange={(checked) => { if (ownerId) setSelection(checked === true ? { ownerId, id: account.id } : null); }}
                  aria-label={`Send Account ${account.account_number}: ${account.app_login_name}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Account {account.account_number} · {account.account_type === "multi" ? "Multi-room" : account.account_type === "triple" ? "Triple-room" : "Single account"}</span>
                  <span className="block break-all font-mono text-sm">{account.app_login_name}</span>
                  <span className="block text-xs text-muted-foreground">{account.expiry_at ? `Expiry: ${new Date(account.expiry_at).toLocaleDateString("en-GB")}` : "No expiry"}</span>
                </span>
              </label>)}
          </fieldset>
          <Button type="submit" className="w-full" disabled={busy || loadingAccounts || !login}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Send to app</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">Your login goes straight to the app once and is then deleted from our side.</p>
        </form>
        <aside className="rounded-lg border border-border bg-surface/90 p-5">
          {/* Account number sits opposite the heading so it is readable at a glance. */}
          <div className="flex flex-nowrap items-center justify-between gap-2">
            <h2 className="min-w-0 truncate font-display font-semibold">My linked devices</h2>
            {customerNumber ? <span className="inline-flex shrink-0 items-baseline gap-1.5 whitespace-nowrap rounded-full border border-primary/50 bg-primary/25 px-2.5 py-1 text-primary-foreground" title="BM Player account number">
              <span className="text-[9px] font-semibold uppercase tracking-wide text-primary-foreground/70">Account no.</span>
              <span className="font-mono text-base font-bold leading-none tracking-[0.1em]">{customerNumber}</span>
            </span> : null}
          </div>
          {devices.length ? <ul className="mt-3 space-y-3">{devices.map((d) => <li key={d.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            {d.platform === "windows" || d.platform === "mac" ? <Laptop className="size-5 text-primary" /> : <Tv className="size-5 text-primary" />}
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{d.name}</div>
              <div className="text-xs text-muted-foreground">{platformLabel[d.platform] ?? d.platform}</div></div>
            <Button size="sm" onClick={() => setTarget(d)}>Send</Button>
            <Button size="icon" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => void remove(d)}><Trash2 /></Button>
          </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No devices yet. Use a code from the app to link one.</p>}
        </aside>
      </div>
    </div>
  </section>;
}

/** Test link to the in-browser BM Player; only rendered on an iPhone or iPad. */
function AppleWebPlayerLink() {
  const [apple, setApple] = useState(false);
  useEffect(() => { setApple(isAppleMobile(navigator.userAgent, navigator.maxTouchPoints || 0)); }, []);
  if (!apple) return null;
  return <div className="mt-4 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm">
    <p className="font-semibold">On an iPhone or iPad?</p>
    <p className="mt-1 text-muted-foreground">Watch in BM Player right here in Safari. Test version.</p>
    <Button asChild size="sm" className="mt-3"><Link to="/player-web"><Tv className="size-4" />Open BM Player</Link></Button>
  </div>;
}

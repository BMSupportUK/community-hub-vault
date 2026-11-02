import { useState } from "react";
import { usePlayerDevices, type PlayerDevice } from "@/hooks/use-player-devices";
import { useServerFn } from "@tanstack/react-start";
import { Laptop, Loader2, Send, Trash2, Tv } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendLoginToDevice, sendLoginWithCode } from "@/lib/player.functions";

const platformLabel: Record<string, string> = { android: "Android TV", firetv: "Fire TV", phone: "Android phone", windows: "Windows PC" };

export function PlayerDeviceLinkSection() {
  const sendCode = useServerFn(sendLoginWithCode);
  const sendDevice = useServerFn(sendLoginToDevice);
  const { devices, reload } = usePlayerDevices();
  const [code, setCode] = useState(""), [username, setUsername] = useState(""), [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [target, setTarget] = useState<PlayerDevice | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (!target && !/^\d{6}$/.test(code)) { setError("Enter the 6-digit code shown on your screen."); return; }
    if (!username.trim() || !password) { setError("Enter your username and password."); return; }
    setBusy(true);
    try {
      if (target) await sendDevice({ data: { deviceId: target.id, username, password } });
      else await sendCode({ data: { code, username, password } });
      toast.success("Sent! Your app will sign in within a few seconds.");
      setCode(""); setPassword(""); setTarget(null); void reload();
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
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-surface/90 p-5">
          {target ? <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
            <span>Sending to <strong>{target.name}</strong></span>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTarget(null)}>Use a code instead</button>
          </div> : <div className="space-y-1.5">
            <Label htmlFor="player-code">6-digit code on your screen</Label>
            <Input id="player-code" inputMode="numeric" autoComplete="off" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} className="font-mono text-lg tracking-[0.4em]" />
          </div>}
          <div className="space-y-1.5"><Label htmlFor="player-user">Username</Label>
            <Input id="player-user" autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="player-pass">Password</Label>
            <Input id="player-pass" type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <Send />}Send to app</Button>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground">Your login goes straight to the app once and is then deleted from our side.</p>
        </form>
        <aside className="rounded-lg border border-border bg-surface/90 p-5">
          <h2 className="font-display font-semibold">My linked devices</h2>
          {devices.length ? <ul className="mt-3 space-y-3">{devices.map((d) => <li key={d.id} className="flex items-center gap-3 rounded-md border border-border p-3">
            {d.platform === "windows" ? <Laptop className="size-5 text-primary" /> : <Tv className="size-5 text-primary" />}
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

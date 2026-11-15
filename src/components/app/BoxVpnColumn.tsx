import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { myBoxVpn, sendVpnToBox, setBoxVpn } from "@/lib/box-vpn.functions";

type Box = { id: string; name: string; platform: string };
const STATUS: Record<string, string> = { sent: "Sent – waiting for box", connecting: "Connecting…", on: "VPN on", off: "VPN off", failed: "Could not connect" };

/** Third Link Device column: customer picks their VPN provider and the box switches it on itself. */
export function BoxVpnColumn({ boxes }: { boxes: Box[] }) {
  const usable = boxes.filter((b) => ["android", "firetv", "phone"].includes(b.platform));
  const send = useServerFn(sendVpnToBox), set = useServerFn(setBoxVpn), mine = useServerFn(myBoxVpn);
  const providers = useQuery({ queryKey: ["vpn-providers"], queryFn: async () => (await supabase.from("vpn_providers").select("id, name, credentials_help").eq("enabled", true).order("sort")).data ?? [] });
  const status = useQuery({ queryKey: ["box-vpn"], queryFn: () => mine(), refetchInterval: 10_000 });
  const [deviceId, setDeviceId] = useState(""), [providerId, setProviderId] = useState("");
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  const box = deviceId || usable[0]?.id || "";
  const help = providers.data?.find((p) => p.id === providerId)?.credentials_help;
  const current = status.data?.find((s) => s.device_id === box);

  async function run(fn: () => Promise<{ ok: boolean; error: string | null }>, done: string) {
    setBusy(true);
    try { const r = await fn(); if (r.ok) { toast.success(done); void status.refetch(); } else toast.error(r.error ?? "Please try again."); }
    catch { toast.error("Please try again."); } finally { setBusy(false); }
  }

  return <aside className="space-y-4 rounded-2xl border border-primary/30 bg-background/55 p-6 shadow-2xl backdrop-blur-md">
    <h2 className="flex items-center gap-2 font-display font-semibold"><ShieldCheck className="size-5 text-primary" />VPN on your box</h2>
    <p className="text-xs text-muted-foreground">Pick your VPN and enter its sign-in details. Your box switches the VPN on and picks the closest server with the fewest people on it.</p>
    {!usable.length ? <p className="text-sm text-muted-foreground">Link an Android box, Fire TV or phone first.</p> : <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => send({ data: { deviceId: box, providerId, username, password } }), "Sent. Your box will ask once to allow the VPN."); setPassword(""); }}>
      <div className="space-y-1.5"><Label htmlFor="vpn-box">Box</Label>
        <select id="vpn-box" value={box} onChange={(e) => setDeviceId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm">
          {usable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="vpn-provider">VPN provider</Label>
        <select id="vpn-provider" required value={providerId} onChange={(e) => setProviderId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm">
          <option value="">Choose your VPN…</option>
          {(providers.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {help && <p className="text-xs text-muted-foreground">Where to find them: {help}</p>}</div>
      <div className="space-y-1.5"><Label htmlFor="vpn-user">VPN username</Label><Input id="vpn-user" autoComplete="off" required value={username} onChange={(e) => setUsername(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="vpn-pass">VPN password</Label><Input id="vpn-pass" type="password" autoComplete="off" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      <Button type="submit" className="w-full" disabled={busy || !providerId || !username || !password}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Send to box</Button>
    </form>}
    {current && <div className="rounded-xl border border-border bg-background/50 p-3 text-sm">
      <p className="font-semibold">{current.enabled ? STATUS[current.status] ?? current.status : "VPN off"}{current.server ? ` · ${current.server}` : ""}</p>
      {current.status_detail && <p className="text-xs text-muted-foreground">{current.status_detail}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {current.enabled ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => set({ data: { deviceId: box, action: "off" } }), "Turning the VPN off.")}>Turn off</Button>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => set({ data: { deviceId: box, action: "on" } }), "Turning the VPN on.")}>Turn on</Button>}
        <Button size="sm" variant="secondary" disabled={busy || !current.enabled} onClick={() => void run(() => set({ data: { deviceId: box, action: "change" } }), "Finding another server.")}>Change server</Button>
      </div></div>}
    <p className="text-xs text-muted-foreground">Your VPN details are locked and only your box can read them. They are never shown again here.</p>
  </aside>;
}

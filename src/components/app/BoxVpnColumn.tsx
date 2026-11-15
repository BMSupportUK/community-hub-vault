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
  const providers = useQuery({ queryKey: ["vpn-providers"], queryFn: async () => (await supabase.from("vpn_providers").select("id, name, credentials_help, auth_kind").eq("enabled", true).order("sort")).data ?? [] });
  const status = useQuery({ queryKey: ["box-vpn"], queryFn: () => mine(), refetchInterval: 10_000 });
  const [deviceId, setDeviceId] = useState(""), [providerId, setProviderId] = useState("");
  const [secret, setSecret] = useState(""), [busy, setBusy] = useState(false);
  const box = deviceId || usable[0]?.id || "";
  const chosen = providers.data?.find((p) => p.id === providerId);
  const help = chosen?.credentials_help;
  const kind = chosen?.auth_kind ?? "wg_config";
  const label = kind === "nord_token" ? "NordVPN access token" : kind === "private_key" ? "WireGuard private key" : "WireGuard setup file";
  const current = status.data?.find((s) => s.device_id === box);

  const kindOf = (id: string) => providers.data?.find((p) => p.id === id)?.auth_kind;
  async function run(fn: () => Promise<{ ok: boolean; error: string | null }>, done: string) {
    setBusy(true);
    try { const r = await fn(); if (r.ok) { toast.success(done); void status.refetch(); } else toast.error(r.error ?? "Please try again."); }
    catch { toast.error("Please try again."); } finally { setBusy(false); }
  }

  return <aside className="space-y-4 rounded-2xl border border-primary/30 bg-background/55 p-6 shadow-2xl backdrop-blur-md">
    <h2 className="flex items-center gap-2 font-display font-semibold"><ShieldCheck className="size-5 text-primary" />VPN on your box</h2>
    <p className="text-xs text-muted-foreground">Pick your VPN and enter its details. Your box switches the VPN on by itself.</p>
    {!usable.length ? <p className="text-sm text-muted-foreground">Link an Android box, Fire TV or phone first.</p> : <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => send({ data: { deviceId: box, providerId, secret } }), "Sent. Your box will ask once to allow the VPN."); setSecret(""); }}>
      <div className="space-y-1.5"><Label htmlFor="vpn-box">Box</Label>
        <select id="vpn-box" value={box} onChange={(e) => setDeviceId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm">
          {usable.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
      <div className="space-y-1.5"><Label htmlFor="vpn-provider">VPN provider</Label>
        <select id="vpn-provider" required value={providerId} onChange={(e) => setProviderId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background/60 px-3 text-sm">
          <option value="">Choose your VPN…</option>
          {(providers.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        {help && <p className="text-xs text-muted-foreground">Where to find them: {help}</p>}</div>
      {providerId && <div className="space-y-1.5"><Label htmlFor="vpn-secret">{label}</Label>
        {kind === "wg_config" ? <textarea id="vpn-secret" required rows={6} spellCheck={false} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={"[Interface]\nPrivateKey = …"} className="w-full rounded-md border border-input bg-background/60 p-2 font-mono text-xs" />
          : <Input id="vpn-secret" type="password" autoComplete="off" required value={secret} onChange={(e) => setSecret(e.target.value)} />}
        <p className="text-xs text-muted-foreground">{kind === "wg_config" ? "Pick the server nearest you on the provider's website; your box uses that server." : "Your box picks the closest server with the fewest people on it."}</p></div>}
      <Button type="submit" className="w-full" disabled={busy || !providerId || secret.trim().length < 20}>{busy ? <Loader2 className="animate-spin" /> : <ShieldCheck />}Send to box</Button>
    </form>}
    {current && <div className="rounded-xl border border-border bg-background/50 p-3 text-sm">
      <p className="font-semibold">{current.enabled ? STATUS[current.status] ?? current.status : "VPN off"}{current.server ? ` · ${current.server}` : ""}</p>
      {current.status_detail && <p className="text-xs text-muted-foreground">{current.status_detail}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {current.enabled ? <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => set({ data: { deviceId: box, action: "off" } }), "Turning the VPN off.")}>Turn off</Button>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => set({ data: { deviceId: box, action: "on" } }), "Turning the VPN on.")}>Turn on</Button>}
        <Button size="sm" variant="secondary" disabled={busy || !current.enabled || kindOf(current.provider_id) === "wg_config"} onClick={() => void run(() => set({ data: { deviceId: box, action: "change" } }), "Finding another server.")}>Change server</Button>
      </div></div>}
    <p className="text-xs text-muted-foreground">Your VPN details are locked and only your box can read them. They are never shown again here.</p>
  </aside>;
}

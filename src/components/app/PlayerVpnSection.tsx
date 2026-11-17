import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { allocateVpn, findSubscribers, setVpnSubscription, updateVpnAccount, vpnOverview, vpnServerList } from "@/lib/vpn-admin.functions";

type Overview = Awaited<ReturnType<typeof vpnOverview>>;
type Sub = Overview["subscribers"][number];
const day = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Dashboard › BM Player › VPN: each subscriber's VPN, their boxes, and allocating existing VPNs. */
export function PlayerVpnSection() {
  const overview = useServerFn(vpnOverview), servers = useServerFn(vpnServerList);
  const setSub = useServerFn(setVpnSubscription), setAcc = useServerFn(updateVpnAccount);
  const [data, setData] = useState<Overview | null>(null);
  const [list, setList] = useState<{ id: number; label: string }[]>([]);
  const load = () => overview().then(setData).catch((e) => toast.error(e.message));
  useEffect(() => { load(); servers().then(setList).catch(() => setList([])); }, []);

  const run = async (p: Promise<{ ok: boolean; error?: string }>, done: string) => {
    try { const r = await p; if (!r.ok) { toast.error(r.error ?? "Couldn't save"); return; } toast.success(done); load(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return <section className="space-y-6">
    <p className="text-sm text-muted-foreground">Customers get the VPN by ticking it at checkout (£2 a month). It starts when the sale is completed and ends on the same day as their subscription. A box makes its own VPN login the first time it checks in.</p>
    <AllocateBox onDone={load} />
    {!data ? <p className="text-sm text-muted-foreground">Loading VPNs…</p> : data.subscribers.length === 0 ? <p className="text-sm text-muted-foreground">No subscribers have the VPN yet.</p> :
      <div className="space-y-3">{data.subscribers.map((s: Sub) => <div key={s.credential_id} className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><p className="font-semibold">{s.login}</p>
            <p className="text-xs text-muted-foreground">{s.active ? "VPN on" : "VPN off"} · ends {day(s.expiry_at)} · {s.source === "admin" ? "allocated by admin" : "from an order"}</p></div>
          <Switch checked={s.active} aria-label={`VPN for ${s.login}`} onCheckedChange={(v) => run(setSub({ data: { credentialId: s.credential_id, active: v } }), v ? "VPN switched on" : "VPN switched off")} />
        </div>
        {s.accounts.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">No box has made its VPN login yet.</p> :
          <div className="mt-3 space-y-2">{s.accounts.map((a) => <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
            <span className="min-w-0 flex-1"><b>{a.device ?? "Not on a box yet"}</b> · {a.username} · {a.status ?? "waiting"}{a.status_detail ? ` (${a.status_detail})` : ""}</span>
            <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" aria-label="VPN server" value={a.server_id ?? ""}
              onChange={(e) => run(setAcc({ data: { id: a.id, serverId: e.target.value ? Number(e.target.value) : null } }), "Server changed")}>
              <option value="">Best server</option>
              {list.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={() => run(setAcc({ data: { id: a.id, newPassword: true } }), "New password made")}>New password</Button>
            <Switch checked={a.enabled} aria-label="VPN on this box" onCheckedChange={(v) => run(setAcc({ data: { id: a.id, enabled: v } }), v ? "On for this box" : "Off for this box")} />
          </div>)}</div>}
      </div>)}</div>}
  </section>;
}

function AllocateBox({ onDone }: { onDone: () => void }) {
  const find = useServerFn(findSubscribers), allocate = useServerFn(allocateVpn);
  const [q, setQ] = useState(""), [hits, setHits] = useState<{ id: string; app_login_name: string; expiry_at: string | null }[]>([]);
  const [pick, setPick] = useState<{ id: string; app_login_name: string } | null>(null);
  const [username, setUsername] = useState(""), [password, setPassword] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { if (q.trim().length < 2) { setHits([]); return; } const t = setTimeout(() => find({ data: { q } }).then((r) => setHits(r.filter((x) => x.id).map((x) => ({ id: x.id!, app_login_name: x.app_login_name ?? "?", expiry_at: x.expiry_at })))).catch(() => setHits([])), 300); return () => clearTimeout(t); }, [q]);

  const save = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await allocate({ data: { credentialId: pick.id, username: username.trim() || undefined, password: password || undefined } });
      if (!r.ok) { toast.error(r.error ?? "Couldn't allocate"); return; }
      toast.success(`VPN allocated to ${pick.app_login_name}`); setPick(null); setQ(""); setUsername(""); setPassword(""); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };

  return <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
    <h3 className="font-semibold">Allocate a VPN to a subscriber</h3>
    <p className="text-xs text-muted-foreground">For customers already using the VPN. Enter the VPNresellers login they already have, or leave it blank to make a new one. It ends on the same day as their subscription.</p>
    {pick ? <p className="text-sm">Subscriber: <b>{pick.app_login_name}</b> <button className="ml-2 text-xs underline" onClick={() => setPick(null)}>Change</button></p> : <>
      <Input placeholder="Search subscriber login" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search subscriber login" />
      {hits.length > 0 && <div className="max-h-48 overflow-y-auto rounded-md border border-border">{hits.map((h) =>
        <button key={h.id} className="block w-full px-3 py-2 text-left text-sm hover:bg-surface-2" onClick={() => setPick(h)}>{h.app_login_name} <span className="text-xs text-muted-foreground">ends {day(h.expiry_at)}</span></button>)}</div>}
    </>}
    <div className="grid gap-2 sm:grid-cols-2">
      <Input placeholder="Existing VPN username (optional)" value={username} onChange={(e) => setUsername(e.target.value)} aria-label="Existing VPN username" />
      <Input type="password" placeholder="Its password" value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Existing VPN password" disabled={!username.trim()} />
    </div>
    <Button disabled={!pick || busy} onClick={save}>{busy ? "Allocating…" : "Allocate VPN"}</Button>
  </div>;
}

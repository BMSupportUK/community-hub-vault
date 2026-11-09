import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { issueOffsitePlayerLogin } from "@/lib/player.functions";

type Row = { id: string; customer_name: string; email: string; number: number; iptv_username: string; expires_at: string | null; created_at: string };

/** Admin-only: issue a BM Player login + account number to someone without a website account. */
export function OffsitePlayerLogins() {
  const issue = useServerFn(issueOffsitePlayerLogin);
  const [f, setF] = useState({ customerName: "", email: "", code: "", username: "", password: "", expiry: "" });
  const [manualId, setManualId] = useState("");
  const [manuals, setManuals] = useState<{ userId: string; name: string }[]>([]);
  useEffect(() => {
    void supabase.rpc("admin_customer_subscription_list").then(({ data }) => {
      setManuals(((data ?? []) as unknown as { userId: string; username: string | null; displayName: string | null; hasSiteAccount: boolean }[])
        .filter((c) => !c.hasSiteAccount).map((c) => ({ userId: c.userId, name: c.username || c.displayName || "Not recorded" })));
    });
  }, []);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const load = () => void supabase.from("player_offsite_customers").select("id, customer_name, email, number, iptv_username, expires_at, created_at")
    .order("created_at", { ascending: false }).then(({ data }) => setRows((data ?? []) as Row[]));
  useEffect(load, []);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const ready = f.customerName.trim() && (manualId ? (!f.email.trim() || /^\S+@\S+\.\S+$/.test(f.email.trim())) : /^\S+@\S+\.\S+$/.test(f.email.trim())) && /^\d{6}$/.test(f.code.replace(/\s/g, "")) && f.username.trim() && f.password;

  return <section className="space-y-3">
    <div>
      <h2 className="font-display font-semibold">Link a non-website customer</h2>
    </div>
    <div className="space-y-1"><Label htmlFor="os-code">BM Player link code *</Label><Input id="os-code" inputMode="numeric" autoComplete="off" placeholder="123 456" maxLength={7} value={f.code} onChange={set("code")} /></div>
    <div className="space-y-1">
      <Label htmlFor="os-manual">Manual customer (keeps their account number)</Label>
      <select id="os-manual" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={manualId}
        onChange={(e) => { const id = e.target.value; setManualId(id); const m = manuals.find((x) => x.userId === id); if (m) setF((v) => ({ ...v, customerName: m.name })); }}>
        <option value="">New customer (gets a new number)</option>
        {manuals.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
      </select>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor="os-name">Customer name *</Label><Input id="os-name" value={f.customerName} onChange={set("customerName")} maxLength={120} /></div>
      <div className="space-y-1"><Label htmlFor="os-email">Email {manualId ? "(optional)" : "*"}</Label><Input id="os-email" type="email" value={f.email} onChange={set("email")} /></div>
      <div className="space-y-1"><Label htmlFor="os-user">App username *</Label><Input id="os-user" value={f.username} onChange={set("username")} autoComplete="off" /></div>
      <div className="space-y-1"><Label htmlFor="os-pass">App password *</Label><Input id="os-pass" value={f.password} onChange={set("password")} autoComplete="off" /></div>
      <div className="space-y-1"><Label htmlFor="os-exp">Expiry (optional)</Label><Input id="os-exp" type="datetime-local" value={f.expiry} onChange={set("expiry")} /></div>
    </div>
    <Button disabled={!ready || busy} onClick={async () => {
      setBusy(true);
      try {
        const r = await issue({ data: { customerName: f.customerName, manualCustomerId: manualId || null, email: f.email, code: f.code, username: f.username, password: f.password, expiresAt: f.expiry ? new Date(f.expiry).toISOString() : null } });
        setIssued(r.number); setManualId(""); setF({ customerName: "", email: "", code: "", username: "", password: "", expiry: "" }); load();
        toast.success("Login sent to the app");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Could not issue the login"); }
      finally { setBusy(false); }
    }}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />}Link player and send login</Button>
    {issued !== null && <p className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">Give the customer their account number: <span className="ml-1 font-mono text-xl font-bold tracking-[0.25em]">{issued}</span></p>}
    {rows.length > 0 && <ul className="divide-y divide-border rounded-md border border-border text-sm">
      {rows.map((r) => <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
        <div><div className="font-medium">{r.customer_name}</div><div className="text-xs text-muted-foreground">{r.email} · Login: {r.iptv_username}{r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleString("en-GB")}` : " · No expiry"}</div></div>
        <span className="font-mono text-lg font-bold tracking-[0.2em]">{r.number}</span>
      </li>)}
    </ul>}
  </section>;
}

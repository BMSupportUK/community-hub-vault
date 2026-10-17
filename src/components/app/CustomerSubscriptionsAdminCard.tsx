import { useEffect, useState } from "react";
import { Gift, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Account = { id: string; login: string; expiresAt: string | null };
type Reward = { orderId: string; ref: string | null; referrerName: string; referrerAccounts: Account[]; rewardedAt: string | null };
type Customer = { userId: string; username: string | null; displayName: string | null; accounts: Account[]; package: string | null; renewedAt: string | null; firstSubscriptionAt: string | null; referrerName: string | null; rewards: Reward[] };
const date = (v: string | null) => v ? new Date(v).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not recorded";

export function CustomerSubscriptionsAdminCard({ canReward }: { canReward: boolean }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reward, setReward] = useState<Reward | null>(null);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_customer_subscriptions");
    setLoading(false);
    setError(error?.message ?? "");
    if (!error) setRows((data ?? []) as unknown as Customer[]);
  };
  useEffect(() => { void load(); }, []);
  const award = async () => {
    if (!reward || !account) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_award_referral_month", { p_order_id: reward.orderId, p_credential_id: account });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Free month added for ${reward.referrerName}`);
    setReward(null);
    await load();
  };
  const visible = rows.filter((c) => [c.username, c.displayName, c.referrerName, ...c.accounts.map((a) => a.login)].some((v) => v?.toLowerCase().includes(search.toLowerCase())));
  return (
    <section className="min-w-0 py-4" aria-label="Customer subscriptions">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Customers <span className="text-sm text-muted-foreground">{rows.length}</span></h2>
        <div className="flex gap-2"><Input aria-label="Search customers" placeholder="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-64" /><Button variant="outline" size="icon" aria-label="Refresh customers" title="Refresh customers" onClick={() => void load()}><RefreshCw /></Button></div>
      </div>
      {error ? <p role="alert" className="text-destructive">{error}</p> : loading ? <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin" /></div> : !visible.length ? <p className="py-8 text-muted-foreground">No customers found.</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr>{["Username", "Current package", "Runs out", "Last renewed", "Referred by", "First subscription", "Referral month"].map((h) => <th key={h} className="border-b border-border p-3">{h}</th>)}</tr></thead>
          <tbody>{visible.map((c) => (
            <tr key={c.userId} className="border-b border-border/60 align-top">
              <td className="p-3 font-medium">{c.username || c.displayName || "Not recorded"}</td>
              <td className="max-w-64 p-3">{c.package || "Not recorded"}</td>
              <td className="p-3">{c.accounts.length ? c.accounts.map((a) => <div key={a.id} className="mb-1">{c.accounts.length > 1 && <span className="block text-xs text-muted-foreground">{a.login}</span>}{date(a.expiresAt)}</div>) : "Not recorded"}</td>
              <td className="p-3">{date(c.renewedAt)}</td><td className="p-3">{c.referrerName || "—"}</td><td className="p-3">{date(c.firstSubscriptionAt)}</td>
              <td className="p-3 space-y-2">{c.rewards.length ? c.rewards.map((r) => r.rewardedAt ? <div key={r.orderId} className="text-xs text-muted-foreground">Added {date(r.rewardedAt)}</div> : canReward ? <div key={r.orderId}><Button variant="outline" size="sm" disabled={!r.referrerAccounts.length} title={!r.referrerAccounts.length ? "Referrer has no saved subscription account" : `Order ${r.ref ?? r.orderId}`} onClick={() => { setReward(r); setAccount(r.referrerAccounts.length === 1 ? r.referrerAccounts[0].id : ""); }}><Gift /> Add free month</Button><span className="block text-xs text-muted-foreground">{r.referrerName}</span></div> : <div key={r.orderId}>Eligible</div>) : "—"}</td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Dialog open={!!reward} onOpenChange={(open) => { if (!open && !busy) setReward(null); }}><DialogContent><DialogHeader><DialogTitle>Add a free month for {reward?.referrerName}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Order {reward?.ref}. One calendar month will be added to their saved expiry, preserving any remaining time.</p><Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Referrer subscription account"><SelectValue placeholder="Choose subscription account" /></SelectTrigger><SelectContent>{reward?.referrerAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.login} · {date(a.expiresAt)}</SelectItem>)}</SelectContent></Select><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReward(null)}>Cancel</Button><Button disabled={!account || busy} onClick={() => void award()}>{busy ? <Loader2 className="animate-spin" /> : <Gift />} Confirm free month</Button></DialogFooter></DialogContent></Dialog>
    </section>
  );
}

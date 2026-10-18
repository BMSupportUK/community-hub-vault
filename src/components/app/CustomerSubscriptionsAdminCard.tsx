import { useEffect, useState } from "react";
import { customerDate, customerHasRecordedYear, customerShowsNoRenewal } from "@/lib/customer-date";
import { customerJoinedYear, customerYearsFromYear, joinedYearToDate, ukCurrentYear } from "@/lib/customer-joined-year";
import { Gift, Loader2, RefreshCw, Pencil, Link2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Account = { id: string; login: string; expiresAt: string | null; renewedAt?: string | null; renewedDateAdjusted?: boolean; package?: string | null; packageProductId?: string | null };
type Reward = { orderId: string; ref: string | null; referrerName: string; referrerAccounts: Account[]; rewardedAt: string | null };
type Customer = { userId: string; username: string | null; displayName: string | null; hasSiteAccount: boolean; accounts: Account[]; package: string | null; packageAllocated: boolean; renewedAt: string | null; renewedDateAdjusted: boolean; firstSubscriptionAt: string | null; customerYears: number | null; firstSubscriptionAdjusted: boolean; referrerName: string | null; rewards: Reward[] };
type ManualOrder = { id: string; ref: string; name: string; createdAt: string; paidAt: string | null; customerId: string; accountId: string | null; kind: string };
const date = customerDate;

const renewalDay = (v: string | null) => v ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(v)) : "";

export function CustomerSubscriptionsAdminCard({ canReward }: { canReward: boolean }) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [tab, setTab] = useState<"site" | "manual">("site");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reward, setReward] = useState<Reward | null>(null);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [joinedYear, setJoinedYear] = useState("");
  const [allocating, setAllocating] = useState<Customer | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [productId, setProductId] = useState("");
  const [packageAccount, setPackageAccount] = useState<Account | null>(null);
  const [renewalEditing, setRenewalEditing] = useState<Customer | null>(null);
  const [renewalAccount, setRenewalAccount] = useState<Account | null>(null);
  const [renewedDate, setRenewedDate] = useState("");
  const [loginEditing, setLoginEditing] = useState<{ customer: Customer; account: Account } | null>(null);
  const [loginName, setLoginName] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [grouping, setGrouping] = useState<Customer | null>(null);
  const [manualOrders, setManualOrders] = useState<ManualOrder[]>([]);
  const [manualOrderId, setManualOrderId] = useState("");
  const [groupAccountId, setGroupAccountId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const openGrouping = async (customer: Customer) => {
    const { data, error } = await supabase.rpc("admin_manual_customer_orders");
    if (error) return toast.error(error.message);
    setManualOrders((data ?? []) as unknown as ManualOrder[]);
    setManualOrderId(""); setGroupAccountId(""); setOrderSearch(customer.displayName || customer.username || ""); setGrouping(customer);
  };
  const groupOrder = async () => {
    if (!grouping || !manualOrderId) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_group_manual_customer_order", { p_order_id: manualOrderId, p_customer_id: grouping.userId, p_account_id: groupAccountId || null } as unknown as { p_order_id: string; p_customer_id: string; p_account_id: string });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Manual order grouped with customer"); setGrouping(null); await load();
  };
  const saveLogin = async () => {
    if (!loginEditing || !loginName.trim()) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_manual_customer_login", { p_order_id: loginEditing.account.id, p_login_name: loginName.trim(), p_password: loginPassword || undefined });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Login details saved");
    setLoginEditing(null);
    await load();
  };
  const saveRenewedDate = async (restore = false) => {
    if (!renewalEditing || (!restore && !renewedDate)) return;
    setBusy(true);
    // NULL restores the recorded renewal; generated RPC types omit nullability.
    const args = { p_customer_id: renewalEditing.userId, p_renewed_date: restore ? null : renewedDate };
    const { error } = renewalAccount && renewalEditing.accounts.length > 1
      ? await supabase.rpc("admin_set_customer_account_renewed", { ...args, p_account_id: renewalAccount.id } as { p_customer_id: string; p_account_id: string; p_renewed_date: string })
      : await supabase.rpc("admin_set_customer_last_renewed", args as { p_customer_id: string; p_renewed_date: string });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Last renewed date updated");
    setRenewalEditing(null);
    await load();
  };
  const openAllocation = async (customer: Customer, selectedAccount: Account | null = null) => {
    const { data, error } = await supabase.from("products").select("id,name").eq("is_active", true).order("sort_order");
    if (error) return toast.error(error.message);
    setProducts(data ?? []);
    setProductId(selectedAccount?.packageProductId ?? "");
    setPackageAccount(selectedAccount);
    setAllocating(customer);
  };
  const savePackage = async () => {
    if (!allocating || !productId) return;
    setBusy(true);
    const { error } = packageAccount
      ? await supabase.rpc("admin_allocate_customer_account_package", { p_customer_id: allocating.userId, p_account_id: packageAccount.id, p_product_id: productId })
      : await supabase.rpc("admin_allocate_customer_package", { p_customer_id: allocating.userId, p_product_id: productId });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Package allocated");
    setAllocating(null);
    await load();
  };
  const saveJoinedYear = async (restore = false) => {
    if (!editing || (!restore && !joinedYear)) return;
    const storedDate = restore ? null : joinedYearToDate(joinedYear);
    if (!restore && !storedDate) return toast.error("Enter a valid year, no later than this year");
    setBusy(true);
    // The SQL function accepts NULL to restore history; generated RPC types omit nullability.
    const args = { p_customer_id: editing.userId, p_first_subscription_date: storedDate };
    const { error } = await supabase.rpc("admin_set_customer_first_subscription", args as { p_customer_id: string; p_first_subscription_date: string });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Year joined updated");
    setEditing(null);
    await load();
  };
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_customer_subscription_list");
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
  const siteRows = visible.filter((c) => c.hasSiteAccount);
  const manualRows = visible.filter((c) => !c.hasSiteAccount);
  const siteCount = rows.filter((c) => c.hasSiteAccount).length;
  const manualCount = rows.length - siteCount;
  const shown = tab === "site" ? siteRows : manualRows;
  return (
    <section className="min-w-0 py-4" aria-label="Customer subscriptions">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl font-bold">Customers</h2>
        <div className="flex gap-2"><Input aria-label="Search customers" placeholder="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-64" /><Button variant="outline" size="icon" aria-label="Refresh customers" title="Refresh customers" onClick={() => void load()}><RefreshCw /></Button></div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "site" | "manual")} className="mb-4">
        <TabsList>
          <TabsTrigger value="site">Site customers <span className="ml-1 text-muted-foreground">{siteCount}</span></TabsTrigger>
          <TabsTrigger value="manual">Manual customers <span className="ml-1 text-muted-foreground">{manualCount}</span></TabsTrigger>
        </TabsList>
      </Tabs>
      {error ? <p role="alert" className="text-destructive">{error}</p> : loading ? <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin" /></div> : !shown.length ? <p className="py-8 text-muted-foreground">No customers found.</p> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground"><tr>{["Username", "Current package", "Runs out", "Last renewed", "Referred by", "Year joined", "Years as customer"].map((h) => <th key={h} className="border-b border-border p-3">{h}</th>)}</tr></thead>
          <tbody>{shown.flatMap((c) => {
            const years = customerYearsFromYear(customerJoinedYear(c.firstSubscriptionAt));
            const hasRecordedYear = customerHasRecordedYear(c.firstSubscriptionAt) || !c.hasSiteAccount;
            const showNoRenewal = customerShowsNoRenewal(hasRecordedYear, years);
            const multi = c.accounts.length > 1;
            const lines: (Account | null)[] = c.accounts.length ? c.accounts : [null];
            return lines.map((a, i) => {
              const last = i === lines.length - 1;
              const renewedAt = multi && a ? a.renewedAt ?? null : c.renewedAt;
              const pkg = (multi && a ? a.package : c.package) || "Not recorded";
              return (
            <tr key={`${c.userId}-${a?.id ?? "none"}`} className={`align-top ${last ? "border-b border-border/60" : "border-b border-dashed border-border/30"}`}>
              <td className="p-3 font-medium">
                <div className="flex flex-wrap items-center gap-2"><span className="break-words">{c.username || c.displayName || "Not recorded"}</span>{multi && <span className="rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Account {i + 1}</span>}{i === 0 && canReward && !c.hasSiteAccount && <Button variant="ghost" size="icon" title="Group manual orders" aria-label={`Group manual orders for ${c.displayName || c.username || "customer"}`} onClick={() => void openGrouping(c)}><Link2 className="size-4" /></Button>}</div>
                <span className={`mt-1 inline-block w-fit rounded-full border px-2 py-0.5 text-[11px] font-normal ${c.hasSiteAccount ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>{c.hasSiteAccount ? "Site account" : "No site account"}</span>
                <span className="mt-1 flex items-center gap-1 break-all text-xs font-normal text-muted-foreground">{a?.login || "No login details"}{!c.hasSiteAccount && canReward && a && <Button variant="ghost" size="icon" className="size-6" title="Edit login details" aria-label={`Edit login details for ${a.login || c.displayName || "customer"}`} onClick={() => { setLoginEditing({ customer: c, account: a }); setLoginName(a.login && a.login !== c.displayName ? a.login : ""); setLoginPassword(""); }}><Pencil className="size-3" /></Button>}</span>
              </td>
              <td className="max-w-64 p-3"><div className="flex items-start gap-2"><span>{pkg}</span>{canReward && ((multi && a) || !c.package || c.packageAllocated) && <Button variant="ghost" size="icon" title="Allocate package" aria-label={`Allocate package for ${a?.login || c.username || c.displayName || "customer"}`} onClick={() => void openAllocation(c, multi ? a : null)}><Pencil className="size-4" /></Button>}</div></td>
              <td className="p-3">{hasRecordedYear ? (a ? date(a.expiresAt) : "Not recorded") : null}</td>
              <td className="p-3"><div className="flex items-start gap-2"><span>{showNoRenewal ? "No Renewal Yet" : date(renewedAt)}</span>{canReward && <Button variant="ghost" size="icon" title="Edit last renewed date" aria-label={`Edit last renewed date for ${a?.login || c.username || c.displayName || "customer"}`} onClick={() => { setRenewalEditing(c); setRenewalAccount(multi ? a : null); setRenewedDate(renewalDay(renewedAt)); }}><Pencil className="size-4" /></Button>}</div></td>
              <td className="p-3"><span>{c.referrerName || "—"}</span>{i === 0 && c.rewards.map((r) => (
                <div key={r.orderId} className={`mt-2 w-fit rounded-md border p-2 text-xs ${r.rewardedAt ? "border-primary/30 bg-primary/10" : "border-border bg-muted/40"}`}>
                  <span className="block font-medium">Referral bonus · 12 month new account</span>
                  {r.rewardedAt ? <span className="block text-muted-foreground">Bonus added {date(r.rewardedAt)}</span>
                    : canReward ? <Button className="mt-1" variant="outline" size="sm" disabled={!r.referrerAccounts.length} title={!r.referrerAccounts.length ? "Referrer has no saved subscription account" : `Order ${r.ref ?? r.orderId}`} onClick={() => { setReward(r); setAccount(r.referrerAccounts.length === 1 ? r.referrerAccounts[0].id : ""); }}><Gift /> Confirm bonus added</Button>
                    : <span className="block text-muted-foreground">Awaiting admin confirmation</span>}
                </div>))}</td>
              <td className="p-3"><div className="flex items-start gap-2"><span>{customerJoinedYear(c.firstSubscriptionAt) ?? "Not recorded"}</span>{i === 0 && canReward && <Button variant="ghost" size="icon" title="Edit year joined" aria-label={`Edit year joined for ${c.username || c.displayName || "customer"}`} onClick={() => { setEditing(c); setJoinedYear(String(customerJoinedYear(c.firstSubscriptionAt) ?? "")); }}><Pencil className="size-4" /></Button>}</div></td>
              <td className="p-3">{years === null ? "Not recorded" : `${years} ${years === 1 ? "year" : "years"}`}</td>
            </tr>); });
          })}</tbody>
        </table></div>
      )}
      <Dialog open={!!reward} onOpenChange={(open) => { if (!open && !busy) setReward(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm referral bonus for {reward?.referrerName}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Order {reward?.ref}. One calendar month will be added to their saved expiry, preserving any remaining time.</p><Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Referrer subscription account"><SelectValue placeholder="Choose subscription account" /></SelectTrigger><SelectContent>{reward?.referrerAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.login} · {date(a.expiresAt)}</SelectItem>)}</SelectContent></Select><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReward(null)}>Cancel</Button><Button disabled={!account || busy} onClick={() => void award()}>{busy ? <Loader2 className="animate-spin" /> : <Gift />} Confirm bonus added</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open && !busy) setEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Year joined · {editing?.username || editing?.displayName}</DialogTitle></DialogHeader><label className="space-y-2 text-sm">Year joined<Input aria-label="Year joined" type="number" inputMode="numeric" min={1000} max={ukCurrentYear()} step={1} value={joinedYear} onChange={(e) => setJoinedYear(e.target.value)} /></label><DialogFooter>{editing?.firstSubscriptionAdjusted && <Button variant="outline" disabled={busy} onClick={() => void saveJoinedYear(true)}>Use recorded year</Button>}<Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancel</Button><Button disabled={busy || !joinedYearToDate(joinedYear)} onClick={() => void saveJoinedYear()}>{busy && <Loader2 className="animate-spin" />}Save year</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!allocating} onOpenChange={(open) => { if (!open && !busy) setAllocating(null); }}><DialogContent><DialogHeader><DialogTitle>Allocate package · {packageAccount?.login || allocating?.username || allocating?.displayName}</DialogTitle></DialogHeader><select aria-label="Subscription package" value={productId} onChange={(e) => setProductId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="" disabled>Choose package</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setAllocating(null)}>Cancel</Button><Button disabled={!productId || busy} onClick={() => void savePackage()}>{busy && <Loader2 className="animate-spin" />}Save package</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!renewalEditing} onOpenChange={(open) => { if (!open && !busy) setRenewalEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Last renewed · {renewalAccount?.login || renewalEditing?.username || renewalEditing?.displayName}</DialogTitle></DialogHeader><label className="space-y-2 text-sm">Last renewed date<Input aria-label="Last renewed date" type="date" value={renewedDate} onChange={(e) => setRenewedDate(e.target.value)} /></label><DialogFooter>{(renewalAccount ? renewalAccount.renewedDateAdjusted : renewalEditing?.renewedDateAdjusted) && <Button variant="outline" disabled={busy} onClick={() => void saveRenewedDate(true)}>Use recorded date</Button>}<Button variant="outline" disabled={busy} onClick={() => setRenewalEditing(null)}>Cancel</Button><Button disabled={busy || !renewedDate} onClick={() => void saveRenewedDate()}>{busy && <Loader2 className="animate-spin" />}Save date</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!loginEditing} onOpenChange={(open) => { if (!open && !busy) setLoginEditing(null); }}><DialogContent><DialogHeader><DialogTitle>Login details · {loginEditing?.customer.displayName || loginEditing?.customer.username}</DialogTitle></DialogHeader><label className="space-y-2 text-sm">Login name<Input aria-label="Login name" autoComplete="off" value={loginName} onChange={(e) => setLoginName(e.target.value)} /></label><label className="space-y-2 text-sm">Password<Input aria-label="Login password" type="text" autoComplete="off" placeholder="Leave blank to keep the saved password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></label><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setLoginEditing(null)}>Cancel</Button><Button disabled={busy || !loginName.trim()} onClick={() => void saveLogin()}>{busy && <Loader2 className="animate-spin" />}Save login details</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!grouping} onOpenChange={(open) => { if (!open && !busy) setGrouping(null); }}><DialogContent><DialogHeader><DialogTitle>Group manual orders · {grouping?.displayName || grouping?.username}</DialogTitle></DialogHeader>
        <Input aria-label="Search manual orders" placeholder="Customer name or order reference" value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} />
        <label className="block space-y-1 text-sm">Manual order<select aria-label="Manual order to group" value={manualOrderId} onChange={(e) => { setManualOrderId(e.target.value); setGroupAccountId(""); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-foreground"><option value="">Choose order</option>{manualOrders.filter((o) => o.id !== grouping?.userId && o.accountId === null && `${o.name} ${o.ref}`.toLowerCase().includes(orderSearch.toLowerCase())).map((o) => <option key={o.id} value={o.id}>{o.name} · {o.ref} · {date(o.createdAt)}</option>)}</select></label>
        <label className="block space-y-1 text-sm">Subscription account<select aria-label="Grouped order subscription" value={groupAccountId} onChange={(e) => setGroupAccountId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-foreground"><option value="">Separate subscription for this customer</option>{grouping?.accounts.filter((a) => a.id !== manualOrderId).map((a) => <option key={a.id} value={a.id}>Renew {a.login} · {date(a.expiresAt)}</option>)}</select></label>
        {groupAccountId && <p className="text-sm text-muted-foreground">A paid order adds its purchased term to this account, preserving remaining time. Site accounts are unchanged.</p>}
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setGrouping(null)}>Cancel</Button><Button disabled={busy || !manualOrderId} onClick={() => void groupOrder()}>{busy && <Loader2 className="animate-spin" />}Group order</Button></DialogFooter>
      </DialogContent></Dialog>
    </section>
  );
}

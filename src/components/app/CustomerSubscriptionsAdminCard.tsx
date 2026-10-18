import { useEffect, useState, type ReactNode } from "react";
import { customerDate, customerHasRecordedYear, customerShowsNoRenewal } from "@/lib/customer-date";
import { customerJoinedYear, customerYearsFromYear, joinedYearToDate, ukCurrentYear } from "@/lib/customer-joined-year";
import { sortCustomers, type CustomerSortDir, type CustomerSortField } from "@/lib/customer-sort";
import { Gift, Loader2, RefreshCw, Pencil, Link2, ArrowDown, ArrowUp } from "lucide-react";
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

export function CustomerSubscriptionsAdminCard({ canReward, memberToolbar, memberDetails, memberEditor }: {
  canReward: boolean;
  memberToolbar?: ReactNode;
  memberDetails?: (userId: string) => ReactNode;
  memberEditor?: (userId: string) => ReactNode;
}) {
  const [rows, setRows] = useState<Customer[]>([]);
  const [tab, setTab] = useState<"site" | "manual">("site");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<CustomerSortField>("default");
  const [sortDir, setSortDir] = useState<CustomerSortDir>("asc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reward, setReward] = useState<Reward | null>(null);
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [customerEditing, setCustomerEditing] = useState<Customer | null>(null);
  const [editAccountId, setEditAccountId] = useState("");
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

    await load();
  };
  const selectEditAccount = (customer: Customer, selected: Account | null) => {
    setEditAccountId(selected?.id ?? "");
    setProductId(selected?.packageProductId ?? "");
    setPackageAccount(customer.accounts.length > 1 ? selected : null);
    setRenewalAccount(customer.accounts.length > 1 ? selected : null);
    setRenewedDate(renewalDay(customer.accounts.length > 1 ? selected?.renewedAt ?? null : customer.renewedAt));
    setLoginEditing(!customer.hasSiteAccount && selected ? { customer, account: selected } : null);
    setLoginName(selected?.login && selected.login !== customer.displayName ? selected.login : "");
    setLoginPassword("");
  };
  const openCustomerEditor = async (customer: Customer) => {
    setCustomerEditing(customer);
    setEditing(customer);
    setRenewalEditing(customer);
    setAllocating(customer);
    setJoinedYear(String(customerJoinedYear(customer.firstSubscriptionAt) ?? ""));
    selectEditAccount(customer, customer.accounts[0] ?? null);
    setProducts([]);
    const { data, error } = await supabase.from("products").select("id,name").eq("is_active", true).order("sort_order");
    if (error) return toast.error(error.message);
    setProducts(data ?? []);
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

    await load();
  };
  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_customer_subscription_list");
    setLoading(false);
    setError(error?.message ?? "");
    if (!error) {
      const customers = (data ?? []) as unknown as Customer[];
      setRows(customers);
      if (customerEditing) {
        const fresh = customers.find((customer) => customer.userId === customerEditing.userId);
        if (fresh) { setCustomerEditing(fresh); setEditing(fresh); setAllocating(fresh); setRenewalEditing(fresh); }
      }
    }
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
  const withNoRenewal = (list: Customer[]) => list.map((c) => {
    const years = customerYearsFromYear(customerJoinedYear(c.firstSubscriptionAt));
    const hasRecordedYear = customerHasRecordedYear(c.firstSubscriptionAt) || !c.hasSiteAccount;
    return { ...c, noRenewal: customerShowsNoRenewal(hasRecordedYear, years) };
  });
  const shown = sortCustomers(withNoRenewal(tab === "site" ? siteRows : manualRows), sortBy, sortDir);
  const Detail = ({ label, children, action }: { label: string; children: ReactNode; action?: ReactNode }) => (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words">{children}</dd></div>
      {action}
    </div>
  );
  return (
    <section className="min-w-0 py-4" aria-label="Customer subscriptions">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-xl font-bold">Customers</h2>{memberToolbar}</div>
        <div className="flex flex-wrap items-center gap-2"><select aria-label="Sort customers by" value={sortBy} onChange={(e) => setSortBy(e.target.value as CustomerSortField)} className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value="default">Sort: Default order</option><option value="name">Name</option><option value="expires">Runs out</option><option value="renewed">Last renewed</option><option value="joined">Year joined</option><option value="years">Years as customer</option><option value="referrer">Referred by</option></select>{sortBy !== "default" && <Button variant="outline" size="icon" aria-label={sortDir === "asc" ? "Sorted oldest to newest, switch to newest first" : "Sorted newest to oldest, switch to oldest first"} title={sortDir === "asc" ? "Oldest to newest" : "Newest to oldest"} onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}>{sortDir === "asc" ? <ArrowDown /> : <ArrowUp />}</Button>}<Input aria-label="Search customers" placeholder="Search customers" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-64" /><Button variant="outline" size="icon" aria-label="Refresh customers" title="Refresh customers" onClick={() => void load()}><RefreshCw /></Button></div>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "site" | "manual")} className="mb-4">
        <TabsList>
          <TabsTrigger value="site">Site customers <span className="ml-1 text-muted-foreground">{siteCount}</span></TabsTrigger>
          <TabsTrigger value="manual">Manual customers <span className="ml-1 text-muted-foreground">{manualCount}</span></TabsTrigger>
        </TabsList>
      </Tabs>
      {error ? <p role="alert" className="text-destructive">{error}</p> : loading ? <div className="grid place-items-center py-12"><Loader2 className="size-5 animate-spin" /></div> : !shown.length ? <p className="py-8 text-muted-foreground">No customers found.</p> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map((c) => {
          const years = customerYearsFromYear(customerJoinedYear(c.firstSubscriptionAt));
          const hasRecordedYear = customerHasRecordedYear(c.firstSubscriptionAt) || !c.hasSiteAccount;
          const showNoRenewal = customerShowsNoRenewal(hasRecordedYear, years);
          const multi = c.accounts.length > 1;
          const lines: (Account | null)[] = c.accounts.length ? c.accounts : [null];
          const name = c.username || c.displayName || "Not recorded";
          return (
          <article key={c.userId} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card/70 p-4">
            <header className="flex flex-wrap items-center gap-2">
              <h3 className="break-words font-semibold">{name}</h3>
              <span className={`inline-block w-fit rounded-full border px-2 py-0.5 text-[11px] font-normal ${c.hasSiteAccount ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted text-muted-foreground"}`}>{c.hasSiteAccount ? "Site account" : "No site account"}</span>
              {canReward && <Button variant="ghost" size="icon" className="ml-auto shrink-0" title="Edit customer" aria-label={`Edit customer ${name}`} onClick={() => void openCustomerEditor(c)}><Pencil className="size-4" /></Button>}
              {canReward && !c.hasSiteAccount && <Button variant="ghost" size="icon" className="shrink-0" title="Group manual orders" aria-label={`Group manual orders for ${c.displayName || c.username || "customer"}`} onClick={() => void openGrouping(c)}><Link2 className="size-4" /></Button>}
            </header>
            {lines.map((a, i) => {
              const renewedAt = multi && a ? a.renewedAt ?? null : c.renewedAt;
              const pkg = (multi && a ? a.package : c.package) || "Not recorded";
              return (
              <section key={a?.id ?? "none"} className={multi ? "space-y-2.5 rounded-lg border border-border/60 bg-background/40 p-3" : "space-y-2.5"}>
                {multi && <span className="w-fit rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">Account {i + 1}</span>}
                <div className="flex items-center gap-1 break-all text-xs text-muted-foreground"><span className="font-semibold uppercase tracking-wide">Login:</span> {a?.login || "No login details"}</div>
                <dl className="space-y-2 text-sm">
                  <Detail label="Current package">{pkg}</Detail>
                  {hasRecordedYear && <Detail label="Runs out">{a ? date(a.expiresAt) : "Not recorded"}</Detail>}
                  <Detail label="Last renewed">{showNoRenewal ? "No Renewal Yet" : date(renewedAt)}</Detail>
                </dl>
              </section>);
            })}
            <dl className="space-y-2 border-t border-border/60 pt-3 text-sm">
              <Detail label="Referred by">{c.referrerName || "—"}</Detail>
              <Detail label="Year joined">{customerJoinedYear(c.firstSubscriptionAt) ?? "Not recorded"}</Detail>
              <Detail label="Years as customer">{years === null ? "Not recorded" : `${years} ${years === 1 ? "year" : "years"}`}</Detail>
            </dl>
            {c.rewards.map((r) => (
              <div key={r.orderId} className={`w-fit max-w-full rounded-md border p-2 text-xs ${r.rewardedAt ? "border-primary/30 bg-primary/10" : "border-border bg-muted/40"}`}>
                <span className="block font-medium">Referral bonus · 12 month new account</span>
                {r.rewardedAt ? <span className="block text-muted-foreground">Bonus added {date(r.rewardedAt)}</span>
                  : canReward ? <Button className="mt-1" variant="outline" size="sm" disabled={!r.referrerAccounts.length} title={!r.referrerAccounts.length ? "Referrer has no saved subscription account" : `Order ${r.ref ?? r.orderId}`} onClick={() => { setReward(r); setAccount(r.referrerAccounts.length === 1 ? r.referrerAccounts[0].id : ""); }}><Gift /> Confirm bonus added</Button>
                  : <span className="block text-muted-foreground">Awaiting admin confirmation</span>}
              </div>))}
            {c.hasSiteAccount && memberDetails?.(c.userId)}
          </article>);
        })}</div>
      )}
      <Dialog open={!!reward} onOpenChange={(open) => { if (!open && !busy) setReward(null); }}><DialogContent><DialogHeader><DialogTitle>Confirm referral bonus for {reward?.referrerName}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Order {reward?.ref}. One calendar month will be added to their saved expiry, preserving any remaining time.</p><Select value={account} onValueChange={setAccount}><SelectTrigger aria-label="Referrer subscription account"><SelectValue placeholder="Choose subscription account" /></SelectTrigger><SelectContent>{reward?.referrerAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.login} · {date(a.expiresAt)}</SelectItem>)}</SelectContent></Select><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setReward(null)}>Cancel</Button><Button disabled={!account || busy} onClick={() => void award()}>{busy ? <Loader2 className="animate-spin" /> : <Gift />} Confirm bonus added</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!customerEditing} onOpenChange={(open) => { if (!open && !busy) setCustomerEditing(null); }}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader><DialogTitle>Edit customer · {customerEditing?.username || customerEditing?.displayName}</DialogTitle></DialogHeader>
          <fieldset disabled={busy} className="space-y-5">
            {customerEditing?.hasSiteAccount && memberEditor?.(customerEditing.userId)}
            <section className="space-y-2 border-b border-border pb-4">
              <label className="block space-y-1 text-sm">Year joined<Input aria-label="Year joined" type="number" inputMode="numeric" min={1000} max={ukCurrentYear()} step={1} value={joinedYear} onChange={(e) => setJoinedYear(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !joinedYearToDate(joinedYear)} onClick={() => void saveJoinedYear()}>Save year</Button>{customerEditing?.firstSubscriptionAdjusted && <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveJoinedYear(true)}>Use recorded year</Button>}</div>
            </section>
            {(customerEditing?.accounts.length ?? 0) > 1 && <label className="block space-y-1 text-sm">Account<select aria-label="Customer account to edit" value={editAccountId} onChange={(e) => { if (customerEditing) selectEditAccount(customerEditing, customerEditing.accounts.find((a) => a.id === e.target.value) ?? null); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">{customerEditing?.accounts.map((a, i) => <option key={a.id} value={a.id}>Account {i + 1} · {a.login || "No login details"}</option>)}</select></label>}
            {loginEditing && <section className="space-y-2 border-b border-border pb-4">
              <label className="block space-y-1 text-sm">Login name<Input aria-label="Login name" autoComplete="off" value={loginName} onChange={(e) => setLoginName(e.target.value)} /></label>
              <label className="block space-y-1 text-sm">Password<Input aria-label="Login password" type="password" autoComplete="new-password" placeholder="Leave blank to keep the saved password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} /></label>
              <Button size="sm" disabled={busy || !loginName.trim()} onClick={() => void saveLogin()}>Save login details</Button>
            </section>}
            {customerEditing && (customerEditing.accounts.length > 1 || !customerEditing.package || customerEditing.packageAllocated) && <section className="space-y-2 border-b border-border pb-4">
              <label className="block space-y-1 text-sm">Current package<select aria-label="Subscription package" value={productId} onChange={(e) => setProductId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"><option value="" disabled>Choose package</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <Button size="sm" disabled={busy || !productId} onClick={() => void savePackage()}>Save package</Button>
            </section>}
            <section className="space-y-2">
              <label className="block space-y-1 text-sm">Last renewed date<Input aria-label="Last renewed date" type="date" value={renewedDate} onChange={(e) => setRenewedDate(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy || !renewedDate} onClick={() => void saveRenewedDate()}>Save date</Button>{(renewalAccount ? renewalAccount.renewedDateAdjusted : customerEditing?.renewedDateAdjusted) && <Button size="sm" variant="outline" disabled={busy} onClick={() => void saveRenewedDate(true)}>Use recorded date</Button>}</div>
            </section>
          </fieldset>
          <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCustomerEditing(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
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

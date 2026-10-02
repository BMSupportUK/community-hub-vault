import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Hourglass, KeyRound, Link2, Loader2, Send, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { StaffCheckoutChat, secureCheckoutUrl } from "@/components/checkout/CheckoutChat";
import { OrderStatusBar } from "@/components/checkout/CheckoutTemplate";
import { createCredentialForOrder, getOrderRenewalAccounts, type ApplyOrderResult, type CredentialCandidate } from "@/lib/order-fulfilment.functions";



function CopyField({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="flex gap-2">
        <input readOnly value={value} className="flex-1 min-w-0 h-9 rounded-lg border border-border bg-background px-2 text-xs font-mono" onFocus={(e) => e.currentTarget.select()} />
        <button type="button" onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500); }} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
          {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {done ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** Secure link + password panel, reused after saving an order and on the orders list. */
export function SecureLinkPanel({ orderId, withChat = true, loginOnly = false, onDone }: { orderId: string; withChat?: boolean; loginOnly?: boolean; onDone?: () => void }) {
  const [link, setLink] = useState<{ token: string; password: string; payment_sent_at: string | null; account_setup_at: string | null; customer_kind: string | null } | null | undefined>(undefined);
  const [orderPaid, setOrderPaid] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [payMethod, setPayMethod] = useState<string | null>(null);
  const [loginName, setLoginName] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [qdCodes, setQdCodes] = useState<{ id: string; label: string; code: string }[]>([]);
  const [qdCodeId, setQdCodeId] = useState("");
  const [expiryLocal, setExpiryLocal] = useState("");
  const [busy, setBusy] = useState(false);
  const createCredential = useServerFn(createCredentialForOrder);
  const loadRenewalAccounts = useServerFn(getOrderRenewalAccounts);
  const [renewAccounts, setRenewAccounts] = useState<CredentialCandidate[] | null>(null);
  const [renewAccountId, setRenewAccountId] = useState("");
  const [renewMonths, setRenewMonths] = useState(0);
  // Early renewals stack the new months on top of the time the customer still has left.
  const [stackEarly, setStackEarly] = useState(true);
  const [paidLocal, setPaidLocal] = useState("");
  const toLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  // Add months without overflowing (31 Jan + 1 month = 28/29 Feb, not 3 Mar) — matches the database.
  const addMonths = (d: Date, m: number) => {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + m);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  };
  useEffect(() => {
    if (link?.customer_kind !== "existing" || !renewAccounts || renewMonths <= 0) return;
    const current = renewAccounts.find((a) => a.id === renewAccountId);
    const remaining = current?.expiry_at ? new Date(current.expiry_at).getTime() : 0;
    const base = new Date(stackEarly ? Math.max(remaining, Date.now()) : Date.now());
    addMonths(base, renewMonths);
    setExpiryLocal(toLocal(base));
  }, [renewAccounts, renewAccountId, renewMonths, stackEarly, link?.customer_kind]);
  // New accounts: expiry = date the payment reached us + months bought.
  useEffect(() => {
    if (!link || link.customer_kind === "existing" || renewMonths <= 0 || !paidLocal) return;
    const base = new Date(paidLocal);
    if (Number.isNaN(base.getTime())) return;
    addMonths(base, renewMonths);
    setExpiryLocal(toLocal(base));
  }, [paidLocal, renewMonths, link?.customer_kind]);
  useEffect(() => {
    // Load the months bought in both the checkout-page window and the admin
    // Orders "secure page" panel, so the expiry date fills in everywhere.
    if (!link) return;
    loadRenewalAccounts({ data: { orderId } }).then((r) => {
      setRenewAccounts(r.accounts);
      setRenewAccountId(r.suggestedId ?? "");
      setRenewMonths(r.months);
    }).catch((e) => { setRenewAccounts([]); if (loginOnly) toast.error(e instanceof Error ? e.message : "Couldn't load the customer's accounts"); });
  }, [loginOnly, !!link, orderId]);
  useEffect(() => {
    Promise.all([
      supabase.from("order_checkout_links").select("token,password,payment_sent_at,account_setup_at,customer_kind").eq("order_id", orderId).maybeSingle(),
      supabase.from("orders").select("paid_at,completed_at,manual_pay_method").eq("id", orderId).maybeSingle(),
      supabase.from("qd_dns_codes").select("id,label,code").order("label"),
    ]).then(([{ data: linkData }, { data: orderData }, { data: codeData }]) => {
      setLink((linkData as never) ?? null);
      const paidAt = (orderData as { paid_at?: string | null } | null)?.paid_at;
      setOrderPaid(!!paidAt);
      setOrderCompleted(!!(orderData as { completed_at?: string | null } | null)?.completed_at);
      setPayMethod(((orderData as { manual_pay_method?: string | null } | null)?.manual_pay_method ?? null)?.toLowerCase() ?? null);
      if (paidAt) setPaidLocal(toLocal(new Date(paidAt)));
      const codes = (codeData ?? []) as { id: string; label: string; code: string }[];
      setQdCodes(codes);
      if (codes.length > 0) setQdCodeId(codes[0].id);
    });
  }, [orderId]);
  const toggleSetup = async (done: boolean) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_set_account_setup" as never, { p_order_id: orderId, p_done: done } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    setLink((l) => (l ? { ...l, account_setup_at: (data as string | null) ?? null } : l));
    toast.success(done ? (link?.customer_kind === "existing" ? "Extension confirmed — you can now complete the sale" : "Account confirmed as set up — you can now complete the sale") : "Account set-up confirmation removed");
  };
  // Bank transfer / cash (and similar) payments are confirmed by hand here —
  // Stripe and Square orders mark themselves paid via their own webhooks.
  const markPaid = async () => {
    if (!confirm("Confirm you've received this payment? The customer will be told their payment is confirmed.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_mark_manual_order_paid" as never, { p_order_id: orderId } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    setOrderPaid(true);
    setPaidLocal(toLocal(new Date()));
    toast.success("Payment marked as received");
  };
  const completeSale = async () => {
    if (!confirm(renewal ? "Mark this renewal as complete?" : "Mark this sale as complete?")) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_complete_paid_order" as never, { _order_id: orderId } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    setOrderCompleted(true);
    toast.success(renewal ? "Renewal completed" : "Sale completed");
  };
  if (link === undefined) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>;
  if (!link) return <p className="text-sm text-muted-foreground">This order has no secure checkout page (it was added before secure pages existed).</p>;
  const url = secureCheckoutUrl(link.token);
  const renewal = link.customer_kind === "existing";
  const sendCredentials = async () => {
    if (!loginName.trim() || !accountPassword.trim()) return toast.error("Username and password are required");
    setBusy(true);
    try {
      const chosen = expiryLocal ? new Date(expiryLocal) : null;
      const result = await createCredential({ data: { orderId, loginName: loginName.trim(), password: accountPassword, expiresAt: chosen && !Number.isNaN(chosen.getTime()) ? chosen.toISOString() : undefined } }) as ApplyOrderResult;
      if (result.status !== "applied") {
        toast.error(result.status === "no_term" ? "The subscription length couldn't be read from the order — pick the expiry date & time below and save again" : "The account details could not be saved");
        return;
      }
      if (chosen && result.months > 0) {
        const { data: newExp, error: expError } = await supabase.rpc("staff_set_order_credential_expiry" as never, { p_order_id: orderId, p_credential_id: result.credentialId || null, p_expiry: chosen.toISOString() } as never);
        if (expError) throw expError;
        result.newExpiry = new Date((newExp as unknown as string) ?? chosen.toISOString()).toISOString();
      }
      const selectedCode = qdCodes.find((code) => code.id === qdCodeId);
      // Remember the chosen QD code on the link so the customer's secure page shows it.
      await supabase.from("order_checkout_links").update({ qd_code_id: selectedCode?.id ?? null } as never).eq("order_id", orderId);
      // The subscription starts when staff save the details, not when the
      // payment arrived — an order paid overnight but processed the next day
      // would otherwise show the customer the wrong start date.
      const starts = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      const expires = new Date(result.newExpiry).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      const message = [
        "Your login details are as follows:",
        `Username: ${loginName.trim()}`,
        `Password: ${accountPassword}`,
        ...(result.months > 0 ? [`Subscription length: ${result.months} month${result.months === 1 ? "" : "s"}`] : []),
        `Starts: ${starts}`,
        `Expires: ${expires}`,
        selectedCode ? `QD app login code (${selectedCode.label}): ${selectedCode.code}` : "If you use the QD app, ask us in this chat for your QD login code.",
      ].join("\n");
      const { error } = await supabase.from("checkout_chat_messages").insert({ order_id: orderId, sender: "staff", staff_id: (await supabase.auth.getUser()).data.user?.id, content: message });
      if (error) throw error;
      const { data, error: setupError } = await supabase.rpc("admin_set_account_setup" as never, { p_order_id: orderId, p_done: true } as never);
      if (setupError) throw setupError;
      setLink((current) => current ? { ...current, account_setup_at: (data as string | null) ?? new Date().toISOString() } : current);
      setAccountPassword("");
      toast.success("Account saved and login details sent in the chat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Account details could not be sent");
    } finally {
      setBusy(false);
    }
  };
  const selectedQd = qdCodes.find((code) => code.id === qdCodeId);
  const extraFields = (
    <>
      <label className="block space-y-1"><span className="text-xs font-medium">Date the payment reached us</span><input type="datetime-local" value={paidLocal} onChange={(event) => setPaidLocal(event.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /><span className="block text-[11px] text-muted-foreground">{renewMonths > 0 ? `The ${renewMonths} month${renewMonths === 1 ? " bought is" : "s bought are"} added from this date.` : "The order's length couldn't be read — set the expiry below."}</span></label>
      <label className="block space-y-1"><span className="text-xs font-medium">Subscription expiry date &amp; time</span><input type="datetime-local" value={expiryLocal} onChange={(event) => setExpiryLocal(event.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /><span className="block text-[11px] text-muted-foreground">Filled in automatically from the payment date — change it if needed.</span></label>
      <label className="block space-y-1"><span className="text-xs font-medium">QD app login code (DNS code from admin dashboard)</span><select value={qdCodeId} onChange={(event) => setQdCodeId(event.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"><option value="">Customer is not using QD</option>{qdCodes.map((code) => <option key={code.id} value={code.id}>{code.label} — {code.code}</option>)}</select></label>
      {selectedQd ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2"><div className="text-[11px] text-muted-foreground">QD login code that will be sent</div><div className="font-mono text-base font-semibold break-all">{selectedQd.code}</div></div>
      ) : qdCodes.length === 0 ? <p className="text-[11px] text-warning">No DNS codes saved in the admin dashboard yet.</p> : null}
    </>
  );
  const fields = (
    <div className="space-y-3 min-w-0">
      <OrderStatusBar
        step={orderCompleted ? 3 : orderPaid ? 2 : 1}
        awaitingConfirmation={!!link.payment_sent_at && !orderPaid}
        accountSetup={!!link.account_setup_at}
        renewal={renewal}
      />
      {link.payment_sent_at && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs"><Hourglass className="size-3.5 text-warning" /> Customer says payment was sent {new Date(link.payment_sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} — awaiting confirmation</div>
      )}
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${orderPaid ? "border-success/40 bg-success/10 text-success" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
        {orderPaid ? <Check className="size-4" /> : <Hourglass className="size-4" />}
        {orderPaid ? "PAID — payment confirmed by staff" : "NOT PAID YET — no payment has been confirmed"}
      </div>
      {!orderPaid && payMethod && !["stripe", "square"].includes(payMethod) && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2.5">
          <p className="text-xs text-muted-foreground flex-1 min-w-40">Waiting on {payMethod === "bank_transfer" || payMethod === "bank" ? "the bank transfer" : payMethod === "cash" ? "the cash payment" : "payment"}. Tap the button below only once the money has arrived.</p>
          <button type="button" disabled={busy} onClick={markPaid} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border-2 border-success text-success bg-background text-xs font-semibold disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : null} Mark as paid
          </button>
        </div>
      )}
      {(orderPaid || !!link.account_setup_at) && <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${link.account_setup_at ? "border-success/40 bg-success/10" : "border-border"}`}>
        <div className="flex items-center gap-2 text-sm font-medium"><UserCheck className={`size-4 ${link.account_setup_at ? "text-success" : "text-muted-foreground"}`} /> {renewal ? "Subscription extended (renewal)" : "Account set up"}</div>
        <p className="text-xs text-muted-foreground">{link.account_setup_at ? `Confirmed ${new Date(link.account_setup_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. The sale can now be completed.` : renewal ? "Confirm the customer's subscription has been extended. The sale can't be completed until you do." : "Confirm the customer's new account is set up. The sale can't be completed until you do."}</p>
        <button type="button" disabled={busy || (!renewal && !link.account_setup_at)} onClick={() => toggleSetup(!link.account_setup_at)} className={`inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium disabled:opacity-60 ${link.account_setup_at ? "border border-border text-muted-foreground" : "bg-success text-background"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {link.account_setup_at ? "Undo confirmation" : (renewal ? "Confirm extension is done" : "Confirm account is set up")}
        </button>
        {link.account_setup_at && !orderCompleted && (
          <button type="button" disabled={busy} onClick={completeSale} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-success text-background text-xs font-semibold disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {renewal ? "Complete renewal" : "Complete sale"}
          </button>
        )}
        {orderCompleted && <p className="text-xs text-success font-medium">Sale completed.</p>}
      </div>}
      {!renewal && orderPaid && !link.account_setup_at && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-primary" /> Complete the new account</div>
          <p className="text-xs text-muted-foreground">Enter the service login details. Saving them creates the customer's credential and sends the username, password, subscription length, dates and QD code in the checkout chat.</p>
          <label className="block space-y-1"><span className="text-xs font-medium">Username</span><input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
          <label className="block space-y-1"><span className="text-xs font-medium">Password</span><input value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
          {extraFields}
          <button type="button" disabled={busy || !loginName.trim() || !accountPassword.trim()} onClick={sendCredentials} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Save and send login details</button>
        </div>
      )}
      <CopyField label="Secure page link" value={url} />
      <CopyField label="Password" value={link.password} />
      <CopyField label="Link + password (to send to the customer)" value={`Your secure order page: ${url}\nPassword: ${link.password}`} />
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="size-3.5" /> Open page</a>
    </div>
  );
  if (loginOnly) {
    if (renewal) {
      if (!orderPaid) return <p className="text-sm text-muted-foreground">The renewal expiry can be set once the order is paid.</p>;
      if (link.account_setup_at) return <p className="text-sm text-success">Renewal confirmed on {new Date(link.account_setup_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</p>;
      if (renewAccounts === null) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading accounts…</div>;
      if (renewAccounts.length === 0) return <p className="text-sm text-warning">This customer has no saved service account in admin Credentials to renew. Add their account in Credentials first.</p>;
      const saveRenewal = async () => {
        const chosen = new Date(expiryLocal);
        if (!expiryLocal || Number.isNaN(chosen.getTime())) return toast.error("Pick the new expiry date & time");
        if (chosen.getTime() <= Date.now()) return toast.error("The new expiry must be in the future");
        setBusy(true);
        try {
          const { error } = await supabase.rpc("staff_set_order_credential_expiry" as never, { p_order_id: orderId, p_credential_id: renewAccountId, p_expiry: chosen.toISOString() } as never);
          if (error) throw error;
          const account = renewAccounts.find((a) => a.id === renewAccountId);
          const expires = chosen.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
          const { error: chatError } = await supabase.from("checkout_chat_messages").insert({ order_id: orderId, sender: "staff", staff_id: (await supabase.auth.getUser()).data.user?.id, content: `Your subscription has been renewed.\n${account?.app_login_name ? `Account: ${account.app_login_name}\n` : ""}New expiry: ${expires}\nJust restart your app to carry on watching.` });
          if (chatError) throw chatError;
          const { data, error: setupError } = await supabase.rpc("admin_set_account_setup" as never, { p_order_id: orderId, p_done: true } as never);
          if (setupError) throw setupError;
          setLink((current) => current ? { ...current, account_setup_at: (data as string | null) ?? new Date().toISOString() } : current);
          toast.success("Renewal expiry saved and sent in the chat");
          onDone?.();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : (error as { message?: string })?.message ?? "Renewal could not be saved");
        } finally {
          setBusy(false);
        }
      };
      return (
        <div className="space-y-3">
          <label className="block space-y-1"><span className="text-xs font-medium">Account to renew</span><select value={renewAccountId} onChange={(event) => setRenewAccountId(event.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm">{renewAccounts.map((a) => <option key={a.id} value={a.id}>{a.app_login_name?.trim() || `Account ${a.account_number ?? "?"}`}{a.expiry_at ? ` — currently expires ${new Date(a.expiry_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}` : ""}</option>)}</select></label>
          <label className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs"><input type="checkbox" checked={stackEarly} onChange={(event) => setStackEarly(event.target.checked)} className="mt-0.5" /><span><span className="font-medium">Early renewal — add the new {renewMonths > 0 ? `${renewMonths} month${renewMonths === 1 ? "" : "s"}` : "months"} on top of the time left</span><span className="block text-muted-foreground">Untick to start the new length from today instead.</span></span></label>
          <label className="block space-y-1"><span className="text-xs font-medium">New subscription expiry date &amp; time</span><input type="datetime-local" value={expiryLocal} onChange={(event) => setExpiryLocal(event.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /><span className="block text-[11px] text-muted-foreground">Pre-filled from the months bought where possible — change it if needed.</span></label>
          <button type="button" disabled={busy || !renewAccountId || !expiryLocal} onClick={saveRenewal} className="inline-flex w-full items-center justify-center gap-2 h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Save renewal expiry</button>
        </div>
      );
    }
    if (!orderPaid) return <p className="text-sm text-muted-foreground">Login details can be added once the order is paid.</p>;
    if (link.account_setup_at) return <p className="text-sm text-success">Login details already sent on {new Date(link.account_setup_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</p>;
    return (
      <div className="space-y-3">
        <label className="block space-y-1"><span className="text-xs font-medium">Username</span><input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
        <label className="block space-y-1"><span className="text-xs font-medium">Password</span><input value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
        {extraFields}
        <button type="button" disabled={busy || !loginName.trim() || !accountPassword.trim()} onClick={async () => { await sendCredentials(); onDone?.(); }} className="inline-flex w-full items-center justify-center gap-2 h-10 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Save and send login details</button>
      </div>
    );
  }
  if (!withChat) return fields;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      {fields}
      <aside className="min-w-0 space-y-2 lg:border-l lg:border-border lg:pl-6">
        <div>
          <div className="text-xs font-medium">Chat for this sale only</div>
          <p className="text-[11px] text-muted-foreground">Only messages attached to this order appear here.</p>
        </div>
        <StaffCheckoutChat orderId={orderId} token={link.token} />
      </aside>
    </div>
  );
}

/** Opens the full-page secure checkout panel for this order. */
export function ManualOrderLinkButton({ orderId, orderRef }: { orderId: string; orderRef: string | null }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/admin-secure-page", search: { order: orderId, ref: orderRef ?? undefined } as never })}
      className="inline-flex items-center gap-1 h-7 px-2 rounded-md border border-border text-xs font-medium hover:bg-surface-2"
    >
      <Link2 className="size-3.5" /> Secure page
    </button>
  );
}


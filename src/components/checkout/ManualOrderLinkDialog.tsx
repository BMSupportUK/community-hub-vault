import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Hourglass, KeyRound, Link2, Loader2, Send, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { StaffCheckoutChat, secureCheckoutUrl } from "@/components/checkout/CheckoutChat";
import { createCredentialForOrder, type ApplyOrderResult } from "@/lib/order-fulfilment.functions";



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
  const [loginName, setLoginName] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [qdCodes, setQdCodes] = useState<{ id: string; label: string; code: string }[]>([]);
  const [qdCodeId, setQdCodeId] = useState("");
  const [busy, setBusy] = useState(false);
  const createCredential = useServerFn(createCredentialForOrder);
  useEffect(() => {
    Promise.all([
      supabase.from("order_checkout_links").select("token,password,payment_sent_at,account_setup_at,customer_kind").eq("order_id", orderId).maybeSingle(),
      supabase.from("orders").select("paid_at").eq("id", orderId).maybeSingle(),
      supabase.from("qd_dns_codes").select("id,label,code").order("label"),
    ]).then(([{ data: linkData }, { data: orderData }, { data: codeData }]) => {
      setLink((linkData as never) ?? null);
      setOrderPaid(!!(orderData as { paid_at?: string | null } | null)?.paid_at);
      const codes = (codeData ?? []) as { id: string; label: string; code: string }[];
      setQdCodes(codes);
      if (codes.length === 1) setQdCodeId(codes[0].id);
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
  if (link === undefined) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>;
  if (!link) return <p className="text-sm text-muted-foreground">This order has no secure checkout page (it was added before secure pages existed).</p>;
  const url = secureCheckoutUrl(link.token);
  const renewal = link.customer_kind === "existing";
  const sendCredentials = async () => {
    if (!loginName.trim() || !accountPassword.trim()) return toast.error("Username and password are required");
    setBusy(true);
    try {
      const result = await createCredential({ data: { orderId, loginName: loginName.trim(), password: accountPassword } }) as ApplyOrderResult;
      if (result.status !== "applied") {
        toast.error(result.status === "no_term" ? "The subscription length could not be read from the order" : "The account details could not be saved");
        return;
      }
      const selectedCode = qdCodes.find((code) => code.id === qdCodeId);
      // Remember the chosen QD code on the link so the customer's secure page shows it.
      await supabase.from("order_checkout_links").update({ qd_code_id: selectedCode?.id ?? null } as never).eq("order_id", orderId);
      const starts = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      const expires = new Date(result.newExpiry).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
      const message = [
        "Your login details are as follows:",
        `Username: ${loginName.trim()}`,
        `Password: ${accountPassword}`,
        `Subscription length: ${result.months} month${result.months === 1 ? "" : "s"}`,
        `Starts: ${starts}`,
        `Expires: ${expires}`,
        selectedCode ? `QD app login code (${selectedCode.label}): ${selectedCode.code}` : "If you use the QD app, ask us in this chat for your QD login code.",
      ].join("\n");
      const { error } = await supabase.from("checkout_chat_messages").insert({ order_id: orderId, sender: "staff", content: message });
      if (error) throw error;
      const { data, error: setupError } = await supabase.rpc("admin_set_account_setup" as never, { p_order_id: orderId, p_done: true } as never);
      if (setupError) throw setupError;
      setLink((current) => current ? { ...current, account_setup_at: (data as string | null) ?? new Date().toISOString() } : current);
      setAccountPassword("");
      toast.success("Account saved and login details sent in the chat");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Account details could not be sent");
    } finally {
      setBusy(false);
    }
  };
  const fields = (
    <div className="space-y-3 min-w-0">
      {link.payment_sent_at && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs"><Hourglass className="size-3.5 text-warning" /> Customer says payment was sent {new Date(link.payment_sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} — awaiting confirmation</div>
      )}
      <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${link.account_setup_at ? "border-success/40 bg-success/10" : "border-border"}`}>
        <div className="flex items-center gap-2 text-sm font-medium"><UserCheck className={`size-4 ${link.account_setup_at ? "text-success" : "text-muted-foreground"}`} /> {renewal ? "Subscription extended (renewal)" : "Account set up"}</div>
        <p className="text-xs text-muted-foreground">{link.account_setup_at ? `Confirmed ${new Date(link.account_setup_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. The sale can now be completed.` : renewal ? "Confirm the customer's subscription has been extended. The sale can't be completed until you do." : "Confirm the customer's new account is set up. The sale can't be completed until you do."}</p>
        <button type="button" disabled={busy || (!renewal && !link.account_setup_at)} onClick={() => toggleSetup(!link.account_setup_at)} className={`inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium disabled:opacity-60 ${link.account_setup_at ? "border border-border text-muted-foreground" : "bg-success text-background"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {link.account_setup_at ? "Undo confirmation" : (renewal ? "Confirm extension is done" : "Confirm account is set up")}
        </button>
      </div>
      {!renewal && orderPaid && !link.account_setup_at && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-primary" /> Complete the new account</div>
          <p className="text-xs text-muted-foreground">Enter the service login details. Saving them creates the customer's credential and sends the username, password, subscription length, dates and QD code in the checkout chat.</p>
          <label className="block space-y-1"><span className="text-xs font-medium">Username</span><input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
          <label className="block space-y-1"><span className="text-xs font-medium">Password</span><input value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
          <label className="block space-y-1"><span className="text-xs font-medium">QD app login code</span><select value={qdCodeId} onChange={(event) => setQdCodeId(event.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"><option value="">Customer is not using QD / send later</option>{qdCodes.map((code) => <option key={code.id} value={code.id}>{code.label}</option>)}</select></label>
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
    if (renewal) return <p className="text-sm text-muted-foreground">This is a renewal — no new login details are needed. Confirm the extension on the admin Secure page.</p>;
    if (!orderPaid) return <p className="text-sm text-muted-foreground">Login details can be added once the order is paid.</p>;
    if (link.account_setup_at) return <p className="text-sm text-success">Login details already sent on {new Date(link.account_setup_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</p>;
    return (
      <div className="space-y-3">
        <label className="block space-y-1"><span className="text-xs font-medium">Username</span><input value={loginName} onChange={(event) => setLoginName(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
        <label className="block space-y-1"><span className="text-xs font-medium">Password</span><input value={accountPassword} onChange={(event) => setAccountPassword(event.target.value)} autoComplete="off" className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm" /></label>
        <label className="block space-y-1"><span className="text-xs font-medium">QD app login code</span><select value={qdCodeId} onChange={(event) => setQdCodeId(event.target.value)} className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"><option value="">Customer is not using QD / send later</option>{qdCodes.map((code) => <option key={code.id} value={code.id}>{code.label}</option>)}</select></label>
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


import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Hourglass, Link2, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { StaffCheckoutChat, secureCheckoutUrl } from "@/components/checkout/CheckoutChat";



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
export function SecureLinkPanel({ orderId, withChat = true }: { orderId: string; withChat?: boolean }) {
  const [link, setLink] = useState<{ token: string; password: string; payment_sent_at: string | null; account_setup_at: string | null; customer_kind: string | null } | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    supabase.from("order_checkout_links").select("token,password,payment_sent_at,account_setup_at,customer_kind").eq("order_id", orderId).maybeSingle()
      .then(({ data }) => setLink((data as never) ?? null));
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
  const fields = (
    <div className="space-y-3 min-w-0">
      {link.payment_sent_at && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs"><Hourglass className="size-3.5 text-warning" /> Customer says payment was sent {new Date(link.payment_sent_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} — awaiting confirmation</div>
      )}
      <div className={`rounded-lg border px-3 py-2.5 space-y-2 ${link.account_setup_at ? "border-success/40 bg-success/10" : "border-border"}`}>
        <div className="flex items-center gap-2 text-sm font-medium"><UserCheck className={`size-4 ${link.account_setup_at ? "text-success" : "text-muted-foreground"}`} /> {renewal ? "Subscription extended (renewal)" : "Account set up"}</div>
        <p className="text-xs text-muted-foreground">{link.account_setup_at ? `Confirmed ${new Date(link.account_setup_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}. The sale can now be completed.` : renewal ? "Confirm the customer's subscription has been extended. The sale can't be completed until you do." : "Confirm the customer's new account is set up. The sale can't be completed until you do."}</p>
        <button type="button" disabled={busy} onClick={() => toggleSetup(!link.account_setup_at)} className={`inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium disabled:opacity-60 ${link.account_setup_at ? "border border-border text-muted-foreground" : "bg-success text-background"}`}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {link.account_setup_at ? "Undo confirmation" : (renewal ? "Confirm extension is done" : "Confirm account is set up")}
        </button>
      </div>
      <CopyField label="Secure page link" value={url} />
      <CopyField label="Password" value={link.password} />
      <CopyField label="Link + password (to send to the customer)" value={`Your secure order page: ${url}\nPassword: ${link.password}`} />
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="size-3.5" /> Open page</a>
    </div>
  );
  if (!withChat) return fields;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      {fields}
      <aside className="min-w-0 space-y-2 lg:border-l lg:border-border lg:pl-6">
        <div className="text-xs font-medium">Chat with the customer</div>
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


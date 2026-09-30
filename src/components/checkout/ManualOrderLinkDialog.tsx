import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Link2, Loader2 } from "lucide-react";
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
  const [link, setLink] = useState<{ token: string; password: string } | null | undefined>(undefined);
  useEffect(() => {
    supabase.from("order_checkout_links").select("token,password").eq("order_id", orderId).maybeSingle()
      .then(({ data }) => setLink((data as never) ?? null));
  }, [orderId]);
  if (link === undefined) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading…</div>;
  if (!link) return <p className="text-sm text-muted-foreground">This order has no secure checkout page (it was added before secure pages existed).</p>;
  const url = secureCheckoutUrl(link.token);
  return (
    <div className="space-y-3">
      <CopyField label="Secure page link" value={url} />
      <CopyField label="Password" value={link.password} />
      <CopyField label="Link + password (to send to the customer)" value={`Your secure order page: ${url}\nPassword: ${link.password}`} />
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink className="size-3.5" /> Open page</a>
      {withChat && (
        <div className="space-y-1 pt-2">
          <div className="text-xs font-medium">Chat with the customer</div>
          <StaffCheckoutChat orderId={orderId} token={link.token} />
        </div>
      )}
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


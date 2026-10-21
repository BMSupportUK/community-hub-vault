import { useState } from "react";
import { Copy, Loader2, Receipt } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/** Passwords are fetched only on a signed-in owner's explicit action, never stored in notifications. */
export function CustomerOrderNoticeActions({ orderId, onOpen }: { orderId: string; onOpen?: () => void }) {
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function act(copy: boolean) {
    if (busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("get_my_order_chat_access", { p_order_id: orderId });
      const access = data?.[0];
      if (error || !access?.token || !access.password) throw new Error("Your secure order could not be opened. Please try again.");
      if (copy) {
        await navigator.clipboard.writeText(access.password);
        onCopied?.();
        toast.success("Secure-chat password copied");
      } else {
        onOpen?.();
        await navigate({ to: "/pay/$token", params: { token: access.token } });
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="flex flex-wrap gap-2" onClick={event => event.stopPropagation()}>
    <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(true)}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />} Copy chat password
    </Button>
    <Button size="sm" disabled={busy} onClick={() => void act(false)}><Receipt className="size-3.5" /> Pay / secure chat</Button>
  </div>;
}
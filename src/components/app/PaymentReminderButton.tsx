import { useEffect, useState } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendPaymentOutstandingEmail } from "@/lib/payment-outstanding-email.functions";

/** Shows only for unpaid manual bank-transfer/cash orders; emails the customer a payment reminder. */
export function PaymentReminderButton({ orderId }: { orderId: string }) {
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(false);
  const send = useServerFn(sendPaymentOutstandingEmail);

  useEffect(() => {
    let off = false;
    supabase
      .from("orders")
      .select("customer_type, manual_pay_method, paid_at, completed_at, status")
      .eq("id", orderId)
      .maybeSingle()
      .then(({ data }) => {
        if (off || !data) return;
        const m = String(data.manual_pay_method ?? "").toLowerCase();
        setEligible(
          data.customer_type === "manual" && !data.paid_at && !data.completed_at &&
          String(data.status ?? "").toLowerCase() !== "cancelled" &&
          ["bank_transfer", "bank", "cash"].includes(m),
        );
      });
    return () => { off = true; };
  }, [orderId]);

  if (!eligible) return null;
  const onClick = async () => {
    if (!confirm("Email the customer that payment is still outstanding?")) return;
    setBusy(true);
    try {
      const res = await send({ data: { orderId } });
      if (res.sent) toast.success("Payment reminder sent");
      else toast.error(res.reason === "no_email" ? "No email address on this order" : "Customer has unsubscribed from emails");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not send reminder");
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" disabled={busy} onClick={onClick} className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-warning/40 text-warning text-xs font-medium hover:bg-warning/10 disabled:opacity-50">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Mail className="size-3.5" />} Payment reminder
    </button>
  );
}

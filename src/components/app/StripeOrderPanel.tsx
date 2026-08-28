import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2 } from "lucide-react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

import { supabase } from "@/integrations/supabase/client";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createStripePaymentIntent } from "@/lib/stripe-payments.functions";

export function StripeLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="Stripe">
      <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="6" ry="6" fill="#635BFF" />
        <path
          d="M14.7 12.4c0-.6.5-.9 1.4-.9 1.2 0 2.8.4 4 1.1V9c-1.3-.5-2.6-.7-4-.7-3.2 0-5.4 1.7-5.4 4.5 0 4.4 6 3.7 6 5.6 0 .7-.6 1-1.6 1-1.4 0-3.2-.6-4.5-1.4v3.7c1.5.6 3 .9 4.5.9 3.3 0 5.6-1.6 5.6-4.5 0-4.7-6-3.9-6-5.7z"
          fill="#fff"
        />
      </svg>
      <span className="text-[13px] font-semibold tracking-tight text-foreground leading-none">
        Stripe
      </span>
    </span>
  );
}

export function StripeOrderPanel({
  orderId,
  canPay = true,
}: {
  orderId: string;
  amountCents?: number;
  canPay?: boolean;
  onChange?: () => void | Promise<void>;
}) {
  const [paid, setPaid] = useState<any | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [fetchingSecret, setFetchingSecret] = useState(false);
  const createPI = useServerFn(createStripePaymentIntent);
  const isFinalPaid = Boolean(
    paid && ["COMPLETED", "completed", "finished"].includes(String(paid.status ?? "")),
  );

  const loadPayment = async () => {
    const { data } = await supabase
      .from("order_payments")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();
    setPaid(data);
  };

  useEffect(() => {
    loadPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    const ch = supabase
      .channel(`opd-stripe-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => loadPayment(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const fetchClientSecret = useCallback(async () => {
    setFetchingSecret(true);
    setBootError(null);
    try {
      const returnUrl = `${window.location.origin}/shop?view=orders&id=${orderId}&session_id={CHECKOUT_SESSION_ID}`;
      const result = await createPI({
        data: { orderId, environment: getStripeEnvironment(), returnUrl },
      });
      if ("error" in result) throw new Error(result.error);
      if (!result.clientSecret) throw new Error("Stripe did not return a client secret");
      return result.clientSecret;
    } catch (e) {
      setBootError((e as Error).message || "Failed to start Stripe checkout");
      throw e;
    } finally {
      setFetchingSecret(false);
    }
  }, [createPI, orderId]);

  const checkoutOptions = useMemo(() => ({ fetchClientSecret }), [fetchClientSecret]);

  if (isFinalPaid) {
    if (paid.provider !== "stripe") return null;
    return (
      <div>
        <StripeLogo className="mb-1.5" />
        <div className="rounded-md bg-success/10 border border-success/20 px-2.5 py-2 space-y-1">
          <div className="flex items-center gap-2 text-success text-xs font-medium">
            <CreditCard className="size-3.5" /> Paid
            {paid.card_brand && paid.last_4 && (
              <span className="font-mono text-muted-foreground">
                {paid.card_brand} •••• {paid.last_4}
              </span>
            )}
          </div>
          {paid.receipt_url && (
            <a
              href={paid.receipt_url}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary hover:underline"
            >
              View receipt
            </a>
          )}
        </div>
      </div>
    );
  }

  if (!canPay) return null;

  return (
    <div className="space-y-3">
      <StripeLogo className="mb-1.5" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        Pay by card
      </div>
      {bootError ? (
        <div className="text-xs text-destructive">{bootError}</div>
      ) : (
        <div className="min-h-[280px] rounded-md border border-border bg-surface-2/50 p-2">
          <EmbeddedCheckoutProvider stripe={getStripe()} options={checkoutOptions}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      )}
      {fetchingSecret && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="size-3 animate-spin" /> Loading checkout…
        </div>
      )}
    </div>
  );
}

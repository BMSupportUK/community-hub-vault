import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, Loader2 } from "lucide-react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";

import { supabase } from "@/integrations/supabase/client";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createStripePaymentIntent, confirmStripePayment } from "@/lib/stripe-payments.functions";

/**
 * Look up the Stripe checkout session recorded for an order and ask the server
 * to verify it. Used by the "I've paid" buttons so a completed card payment is
 * detected even if the customer never came back through the return URL.
 */
export async function verifyStripePaymentForOrder(
  confirmFn: (args: { data: { orderId: string; sessionId: string; environment: ReturnType<typeof getStripeEnvironment> } }) => Promise<any>,
  orderId: string,
): Promise<any | null> {
  const { data } = await supabase
    .from("order_payments")
    .select("provider,provider_payment_id")
    .eq("order_id", orderId)
    .maybeSingle();
  const sessionId = (data as any)?.provider_payment_id as string | undefined;
  if (!data || (data as any).provider !== "stripe" || !sessionId) return null;
  return confirmFn({ data: { orderId, sessionId, environment: getStripeEnvironment() } });
}

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
  onChange,
}: {
  orderId: string;
  amountCents?: number;
  canPay?: boolean;
  onChange?: () => void | Promise<void>;
}) {
  const [paid, setPaid] = useState<any | null>(null);
  const [orderPaidAt, setOrderPaidAt] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [fetchingSecret, setFetchingSecret] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  const createPI = useServerFn(createStripePaymentIntent);
  const confirmStripe = useServerFn(confirmStripePayment);
  const isFinalPaid = Boolean(
    (paid && ["COMPLETED", "completed", "finished"].includes(String(paid.status ?? ""))) ||
      (orderPaidAt && paid?.provider === "stripe"),
  );

  const loadPayment = async () => {
    const [{ data }, { data: order }] = await Promise.all([
      supabase.from("order_payments").select("*").eq("order_id", orderId).maybeSingle(),
      supabase.from("orders").select("paid_at").eq("id", orderId).maybeSingle(),
    ]);
    setPaid(data);
    setOrderPaidAt((order as any)?.paid_at ?? null);
  };

  useEffect(() => {
    loadPayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Silently reconcile the recorded Stripe session so a completed card payment
  // is confirmed (and the order marked paid) even if the customer never came
  // back through the return URL — this prevents paying the same order twice.
  useEffect(() => {
    if (isFinalPaid) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await verifyStripePaymentForOrder(confirmStripe, orderId);
        if (cancelled || !res || "error" in res) return;
        await loadPayment();
        await onChange?.();
      } catch {
        /* ignore background reconciliation errors */
      }
    };
    sync();
    const timer = window.setInterval(sync, 10_000);
    const onFocus = () => sync();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, isFinalPaid]);

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

  const checkPaid = async () => {
    setChecking(true);
    setCheckMsg(null);
    try {
      const res = await verifyStripePaymentForOrder(confirmStripe, orderId);
      if (!res) {
        setCheckMsg("No card payment found for this order yet.");
      } else if ("error" in res) {
        setCheckMsg(res.error);
      } else {
        setCheckMsg("Card payment confirmed.");
        await loadPayment();
        await onChange?.();
      }
    } catch (e) {
      setCheckMsg((e as Error).message || "Could not check the card payment");
    } finally {
      setChecking(false);
    }
  };

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

  // Order already settled (e.g. paid via another provider) — never offer a
  // second card payment for it.
  if (orderPaidAt) return null;

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
      <button
        type="button"
        onClick={checkPaid}
        disabled={checking}
        className="w-full text-xs text-primary hover:underline disabled:opacity-60"
      >
        {checking ? "Checking…" : "I've paid — check card payment"}
      </button>
      {checkMsg && <div className="text-[11px] text-muted-foreground text-center">{checkMsg}</div>}
    </div>
  );
}

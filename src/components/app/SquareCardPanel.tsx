import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrency } from "@/hooks/use-currency";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSquareWebConfig, chargeOrderWithSquare } from "@/lib/square-payments.functions";

declare global {
  interface Window {
    Square?: any;
  }
}

// Module-level caches so config + SDK are fetched at most once per page load.
let _squareConfigPromise: Promise<any> | null = null;
function prewarmSquareConfig(fn: (...args: any[]) => Promise<any>): Promise<any> {
  if (!_squareConfigPromise) {
    _squareConfigPromise = fn().catch((e) => {
      _squareConfigPromise = null;
      throw e;
    });
  }
  return _squareConfigPromise;
}

function loadSquareSdk(env: "sandbox" | "production"): Promise<any> {
  if (typeof window === "undefined") return Promise.reject(new Error("No window"));
  if (window.Square) return Promise.resolve(window.Square);
  const id = "square-web-sdk";
  const existing = document.getElementById(id) as HTMLScriptElement | null;
  const src =
    env === "sandbox"
      ? "https://sandbox.web.squarecdn.com/v1/square.js"
      : "https://web.squarecdn.com/v1/square.js";
  return new Promise((resolve, reject) => {
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Square));
      existing.addEventListener("error", () => reject(new Error("Failed to load Square SDK")));
      if (window.Square) resolve(window.Square);
      return;
    }
    const s = document.createElement("script");
    s.id = id;
    s.src = src;
    s.async = true;
    s.onload = () => resolve(window.Square);
    s.onerror = () => reject(new Error("Failed to load Square SDK"));
    document.head.appendChild(s);
  });
}

export function SquareLogo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`} aria-label="Square">
      <svg viewBox="0 0 32 32" className="h-4 w-4" aria-hidden="true">
        <rect x="1" y="1" width="30" height="30" rx="6" ry="6" fill="#000000" />
        <rect x="10" y="10" width="12" height="12" rx="2" ry="2" fill="#ffffff" />
      </svg>
      <span className="text-[13px] font-semibold tracking-tight text-foreground leading-none">
        Square
      </span>
    </span>
  );
}

export function SquareCardPanel({
  orderId,
  amountCents,
  canPay,
  onChange,
  getConfigOverride,
  chargeOverride,
}: {
  orderId: string;
  amountCents: number;
  canPay: boolean;
  onChange?: () => void | Promise<void>;
  /** Used by the password-gated secure checkout page (no sign-in). */
  getConfigOverride?: () => Promise<any>;
  chargeOverride?: (args: { data: { orderId: string; sourceId: string } }) => Promise<any>;
}) {
  const [paid, setPaid] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const cardInstanceRef = useRef<any>(null);
  const paymentsRef = useRef<any>(null);
  const googlePayBtnRef = useRef<HTMLDivElement | null>(null);
  const googlePayInstanceRef = useRef<any>(null);
  const [googlePayReady, setGooglePayReady] = useState(false);
  const { format } = useCurrency();
  const getConfigDefault = useServerFn(getSquareWebConfig);
  const chargeDefault = useServerFn(chargeOrderWithSquare);
  const getConfig = getConfigOverride ?? getConfigDefault;
  const chargeFn = chargeOverride ?? chargeDefault;

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
  }, [orderId]);
  useEffect(() => {
    const ch = supabase
      .channel(`op-${orderId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_payments", filter: `order_id=eq.${orderId}` },
        () => loadPayment(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    if (!canPay || paid || !open) return;
    (async () => {
      try {
        const cfg = await prewarmSquareConfig(getConfig);
        const Square = await loadSquareSdk(cfg.environment);
        if (cancelled) return;
        const payments = Square.payments(cfg.applicationId, cfg.locationId);
        paymentsRef.current = payments;
        const card = await payments.card();
        if (cancelled) {
          try {
            card.destroy();
          } catch {}
          return;
        }
        if (cardRef.current) {
          await card.attach(cardRef.current);
          cardInstanceRef.current = card;
          setReady(true);
        }
        // Wallet payment request (shared by Apple Pay + Google Pay)
        const buildPaymentRequest = () =>
          payments.paymentRequest({
            countryCode: "GB",
            currencyCode: "GBP",
            total: { amount: (amountCents / 100).toFixed(2), label: "Total" },
          });
        // Google Pay
        try {
          const gpReq = buildPaymentRequest();
          const gp = await payments.googlePay(gpReq);
          if (cancelled) {
            try {
              gp.destroy();
            } catch {}
          } else if (googlePayBtnRef.current) {
            await gp.attach(googlePayBtnRef.current, { buttonType: "pay", buttonSizeMode: "fill" });
            googlePayInstanceRef.current = gp;
            setGooglePayReady(true);
          }
        } catch (e) {
          console.warn("[square] Google Pay unavailable", e);
        }
      } catch (e) {
        if (!cancelled) setBootError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      try {
        cardInstanceRef.current?.destroy();
      } catch {}
      cardInstanceRef.current = null;
      try {
        googlePayInstanceRef.current?.destroy();
      } catch {}
      googlePayInstanceRef.current = null;
      setReady(false);
      setGooglePayReady(false);
    };
  }, [canPay, paid, orderId, amountCents, open]);

  const tokenizeAndCharge = async (instance: any, label: string) => {
    if (!instance) return;
    setLoading(true);
    try {
      const result = await instance.tokenize();
      if (result.status !== "OK") {
        // Apple/Google Pay user-cancel comes through here too — silence it.
        if (result.status === "Cancel") return;
        const msg = result.errors?.[0]?.message || `${label} tokenization failed`;
        throw new Error(msg);
      }
      const res = await chargeFn({ data: { orderId, sourceId: result.token } });
      toast.success(`Paid ${format(amountCents)}`);
      setPaid({
        status: res.status,
        card_brand: res.cardBrand,
        last_4: res.last4,
        receipt_url: res.receiptUrl,
        amount_cents: amountCents,
      });
      setOpen(false);
      await onChange?.();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const handlePay = () => tokenizeAndCharge(cardInstanceRef.current, "Card");
  const handleGooglePay = () => tokenizeAndCharge(googlePayInstanceRef.current, "Google Pay");

  if (paid) {
    // Paid via crypto/NOWPayments — hide the Square block; the order header
    // already shows the paid method and the CryptoPanel renders its own
    // confirmation.
    if (paid.provider === "nowpayments") return null;
    // Paid via Stripe — StripePanel renders its own confirmation.
    if (paid.provider === "stripe") return null;
    return (
      <div>
        <SquareLogo className="mb-1.5" />
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Card Payment via Square
        </div>
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
    <div>
      <SquareLogo className="mb-1.5" />
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
        Pay by card
      </div>
      <button
        onClick={() => setOpen(true)}
        className="w-full px-2.5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90"
      >
        <CreditCard className="size-3.5" />
        Pay {format(amountCents)} by card
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SquareLogo /> Card Payment
            </DialogTitle>
          </DialogHeader>
          {bootError ? (
            <div className="text-xs text-destructive">{bootError}</div>
          ) : (
            <div className="space-y-3">
              {googlePayReady && (
                <div className="space-y-1.5">
                  <div
                    ref={googlePayBtnRef}
                    onClick={handleGooglePay}
                    className="w-full min-h-[44px] cursor-pointer"
                    aria-disabled={loading}
                  />
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <div className="flex-1 h-px bg-border" /> or pay by card{" "}
                    <div className="flex-1 h-px bg-border" />
                  </div>
                </div>
              )}
              <div
                ref={cardRef}
                className="rounded-md bg-surface-2 border border-border px-2 py-2 min-h-[60px]"
              />
              <button
                onClick={handlePay}
                disabled={!ready || loading}
                className="w-full px-2.5 py-2 rounded-md bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                <CreditCard className="size-3.5" />
                {loading ? "Processing…" : ready ? `Pay ${format(amountCents)}` : "Loading…"}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

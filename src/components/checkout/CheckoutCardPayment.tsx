import { useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { SquareCardPanel } from "@/components/app/SquareCardPanel";
import { checkoutSquareCharge, checkoutSquareConfig, checkoutStripeSession } from "@/lib/checkout-pay.functions";

/** Inline card payment for the secure checkout page (Square or Stripe). */
export function CheckoutCardPayment({ token, password, method, amountCents, onPaid }: {
  token: string; password: string; method: "square" | "stripe"; amountCents: number; onPaid: () => void | Promise<void>;
}) {
  const cfg = useServerFn(checkoutSquareConfig);
  const charge = useServerFn(checkoutSquareCharge);
  const stripeSession = useServerFn(checkoutStripeSession);

  const getConfigOverride = useCallback(() => cfg({ data: { token, password } }), [cfg, token, password]);
  const chargeOverride = useCallback(
    (args: { data: { orderId: string; sourceId: string } }) => charge({ data: { token, password, sourceId: args.data.sourceId } }),
    [charge, token, password],
  );

  const stripeOptions = useMemo(() => ({
    fetchClientSecret: async () => {
      const r = await stripeSession({ data: { token, password, environment: getStripeEnvironment(), returnUrl: window.location.href } });
      if ("error" in r) throw new Error(r.error);
      return r.clientSecret;
    },
    onComplete: () => { void onPaid(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [token, password]);

  if (method === "square") {
    return (
      <SquareCardPanel
        orderId={token}
        amountCents={amountCents}
        canPay
        onChange={onPaid}
        getConfigOverride={getConfigOverride}
        chargeOverride={chargeOverride}
      />
    );
  }
  return (
    <div className="rounded-xl overflow-hidden">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={stripeOptions}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

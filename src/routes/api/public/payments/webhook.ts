import { createFileRoute } from "@tanstack/react-router";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";

/**
 * Stripe webhook. Signature-verified; on a paid checkout session it re-checks
 * the order's Stripe session (amount must match) and marks the order paid —
 * a backup in case the customer closes the page before it confirms.
 */
export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        const env: StripeEnv = rawEnv;
        let event: { type: string; data: { object: any } };
        try {
          event = await verifyWebhook(request, env);
        } catch (e) {
          console.error("Stripe webhook verification failed:", e);
          return new Response("Invalid signature", { status: 400 });
        }
        try {
          if (
            event.type === "checkout.session.completed" ||
            event.type === "checkout.session.async_payment_succeeded"
          ) {
            const session = event.data.object;
            const orderId = session?.metadata?.order_id;
            if (orderId && /^[0-9a-f-]{36}$/i.test(String(orderId)) && session.payment_status !== "unpaid") {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const { syncStripeSession } = await import("@/lib/checkout-pay.functions");
              await syncStripeSession(supabaseAdmin, String(orderId));
            }
          }
        } catch (e) {
          // Never make Stripe retry forever; the checkout page re-checks too.
          console.error("Stripe webhook handling failed:", e);
        }
        return Response.json({ received: true });
      },
    },
  },
});

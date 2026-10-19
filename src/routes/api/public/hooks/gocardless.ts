import { createFileRoute } from "@tanstack/react-router";

/** GoCardless webhook: signature-checked, then each payment is re-read from GoCardless. */
export const Route = createFileRoute("/api/public/hooks/gocardless")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const { verifyGoCardlessSignature, syncGoCardlessPayment } = await import("@/lib/gocardless.server");
        if (!(await verifyGoCardlessSignature(body, request.headers.get("Webhook-Signature")))) {
          return new Response("Invalid signature", { status: 498 });
        }
        let events: any[] = [];
        try { events = JSON.parse(body).events ?? []; } catch { return new Response("Bad body", { status: 400 }); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        try {
          for (const ev of events.slice(0, 200)) {
            const paymentId = ev?.resource_type === "payments" ? ev.links?.payment : ev?.resource_type === "billing_requests" ? ev.links?.payment_request_payment : null;
            if (typeof paymentId === "string" && /^PM[0-9A-Z]+$/.test(paymentId)) await syncGoCardlessPayment(supabaseAdmin, paymentId, ev.links?.payout ?? null);
          }
        } catch (e) {
          console.error("[gocardless webhook]", e);
          return new Response("Failed", { status: 500 });
        }
        return new Response("ok");
      },
    },
  },
});

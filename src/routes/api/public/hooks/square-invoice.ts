import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

export const Route = createFileRoute("/api/public/hooks/square-invoice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const sigKey = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
        if (!sigKey) return new Response("Webhook key not configured", { status: 500 });

        const signature = request.headers.get("x-square-hmacsha256-signature");
        const body = await request.text();
        const notificationUrl = request.url;

        const expected = createHmac("sha256", sigKey)
          .update(notificationUrl + body)
          .digest("base64");

        try {
          if (
            !signature ||
            signature.length !== expected.length ||
            !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
          ) {
            return new Response("Invalid signature", { status: 401 });
          }
        } catch {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try { payload = JSON.parse(body); } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const invoice = payload?.data?.object?.invoice;
        if (!invoice?.id) return new Response("ok");

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: row } = await supabaseAdmin
          .from("order_invoices")
          .select("order_id,status")
          .eq("square_invoice_id", invoice.id)
          .maybeSingle();

        if (!row) return new Response("ok");

        try {
          const { syncProviderInvoice } = await import('@/lib/provider-invoices.server');
          await syncProviderInvoice(supabaseAdmin, row.order_id);
        } catch (error) {
          console.error('[square-invoice] confirmation failed', error);
          return new Response('Payment confirmation failed', { status: 500 });
        }

        return new Response("ok");
      },
    },
  },
});
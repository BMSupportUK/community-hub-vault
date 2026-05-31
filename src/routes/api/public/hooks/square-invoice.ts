import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

        const eventType: string = payload?.type ?? "";
        const invoice = payload?.data?.object?.invoice;
        if (!invoice?.id) return new Response("ok");

        const { data: row } = await supabaseAdmin
          .from("order_invoices")
          .select("order_id,status")
          .eq("square_invoice_id", invoice.id)
          .maybeSingle();

        if (!row) return new Response("ok");

        let newStatus = invoice.status as string | undefined;
        if (eventType === "invoice.payment_made") newStatus = "PAID";
        else if (eventType === "invoice.canceled") newStatus = "CANCELED";

        await supabaseAdmin
          .from("order_invoices")
          .update({
            status: newStatus ?? row.status,
            public_url: invoice.public_url ?? undefined,
            invoice_number: invoice.invoice_number ?? undefined,
            last_synced_at: new Date().toISOString(),
          })
          .eq("square_invoice_id", invoice.id);

        // If the invoice is paid, mark the underlying order as paid too.
        if (newStatus === "PAID" && row.order_id) {
          const { data: order } = await supabaseAdmin
            .from("orders")
            .select("id,paid_at,status")
            .eq("id", row.order_id)
            .maybeSingle();
          if (order && !order.paid_at) {
            await supabaseAdmin
              .from("orders")
              .update({
                paid_at: new Date().toISOString(),
                status: order.status === "cancelled" ? order.status : "paid",
              })
              .eq("id", row.order_id);
          }
        }

        return new Response("ok");
      },
    },
  },
});
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const creds = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(1).max(64) });

/** Phone pay page for a VPN bought in BM Player: gated by the box-issued link token + password. */
export const vpnPaySummary = createServerFn({ method: "POST" })
  .inputValidator((d) => creds.parse(d))
  .handler(async ({ data }) => {
    const { unlock } = await import("@/lib/checkout.server");
    const u = await unlock(data.token, data.password);
    if (!u) return { error: "This VPN payment link isn't valid. Press Get VPN on your BM Player again for a new one." } as const;
    const { data: o } = await u.supabaseAdmin.from("orders").select("id, total_cents, customer_type, status, order_ref").eq("id", u.link.order_id).maybeSingle();
    if (!o || o.customer_type !== "vpn") return { error: "This link isn't a VPN payment." } as const;
    if (o.status === "cancelled") return { error: "This VPN payment was cancelled. Press Get VPN on your BM Player for a new one." } as const;
    const { vpnFinish } = await import("@/lib/vpn-purchase.server");
    const done = await vpnFinish(o.id as string);
    const { data: p } = await u.supabaseAdmin.from("vpn_purchases").select("days, paid_until").eq("order_id", String(o.id)).maybeSingle();
    return { pence: Number(o.total_cents), days: Number(p?.days ?? 0), until: String(p?.paid_until ?? ""), ref: String(o.order_ref ?? ""), paid: done.paid } as const;
  });

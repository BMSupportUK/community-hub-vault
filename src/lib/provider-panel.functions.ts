import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canCompleteCheckoutSteps } from "@/lib/checkout-access";
import { deriveOrderTerms } from "@/lib/order-terms";
import { panelPackageId } from "@/lib/provider-panel-packages";

const OWNER_ID = "73c113ce-ce1b-43f0-af24-c2a36cf0d8e7";

type Result = { ok: true; username: string; password: string; exp: string; again: boolean } | { ok: false; error: string };

/** Admin/management: create (new customer) or extend (renewal) the provider line for a paid order — once per order. */
export const providerSetupLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid(), kind: z.enum(["create", "renew"]), username: z.string().trim().max(80).optional() }).parse(d))
  .handler(async ({ data, context }): Promise<Result> => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!canCompleteCheckoutSteps((roles ?? []).map((r) => String(r.role)))) return { ok: false, error: "Only admin and management can do this." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: order }, { data: items }] = await Promise.all([
      supabaseAdmin.from("orders").select("id, paid_at, status, email, user_id, wants_adult_content, order_ref, customer_type").eq("id", data.orderId).maybeSingle(),
      supabaseAdmin.from("order_items").select("product_name, quantity").eq("order_id", data.orderId),
    ]);
    if (!order) return { ok: false, error: "Order not found." };
    if (!order.paid_at || order.status === "cancelled") return { ok: false, error: "The order must be paid first." };
    if (order.customer_type === "vpn") return { ok: false, error: "VPN orders don't use the provider panel." };
    const terms = deriveOrderTerms((items ?? []).map((i) => ({ product_name: i.product_name as string | null, quantity: i.quantity as number | null })));
    const packageId = panelPackageId(terms.months, terms.accountType, order.wants_adult_content === true);
    if (!packageId) return { ok: false, error: `We only sell 1, 6 and 12 months — ${terms.months} month(s) can't be set up on the panel.` };
    if (data.kind === "renew" && !data.username) return { ok: false, error: "Pick the customer's login to renew first." };

    // Once per order: claim the row, or hand back what was already done.
    const { data: prev } = await supabaseAdmin.from("order_provisioning").select("*").eq("order_id", data.orderId).maybeSingle();
    if (prev?.status === "done") return { ok: true, username: String(prev.panel_username), password: String(prev.panel_password ?? ""), exp: String(prev.exp_date ?? ""), again: true };
    if (prev && prev.status !== "failed") return { ok: false, error: "This order is already being set up on the panel. Wait a minute and try again." };
    // A failed renewal may only be retried when the line still shows the expiry it had before that attempt.
    let renewBefore = "";
    if (prev && data.kind === "renew" && prev.panel_line_id) {
      const pp = await import("@/lib/provider-panel.server");
      const now = (await pp.readLine(await pp.panelLogin(), String(prev.panel_line_id))).exp;
      if (!prev.exp_date || !now || now !== String(prev.exp_date)) return { ok: false, error: `An earlier renewal of ${prev.panel_username} may have gone through. Check the line on the panel and confirm by hand.` };
      renewBefore = now;
    }
    if (prev) {
      const { data: claimed } = await supabaseAdmin.from("order_provisioning").update({ status: "working", error: null, updated_at: new Date().toISOString() }).eq("order_id", data.orderId).eq("status", "failed").select("order_id");
      if (!claimed?.length) return { ok: false, error: "This order is already being set up on the panel." };
    } else {
      const { error } = await supabaseAdmin.from("order_provisioning").insert({ order_id: data.orderId, kind: data.kind, package_id: String(packageId), created_by: context.userId });
      if (error) return { ok: false, error: "This order is already being set up on the panel." };
    }

    const save = (patch: Record<string, unknown>) => supabaseAdmin.from("order_provisioning").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("order_id", data.orderId);
    try {
      const pp = await import("@/lib/provider-panel.server");
      const panel = await pp.panelLogin();
      let line: { id: string; username: string; password: string; exp: string };
      if (data.kind === "create") {
        // A retry after a half-finished purchase looks the saved username up instead of buying again.
        const existing = prev?.panel_username ? await pp.panelFindLine(panel, String(prev.panel_username)) : null;
        if (existing) {
          const r = await pp.readLine(panel, existing);
          line = { id: existing, username: r.username, password: r.password, exp: r.exp };
        } else {
        const username = prev?.panel_username ? String(prev.panel_username) : await pp.panelNewUsername(panel);
        await save({ status: "submitted", panel_username: username });
        // Always the customer's own email: the order's, else their account email.
        let email = (order.email ?? "").trim();
        if (!email && order.user_id) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(String(order.user_id));
          email = (u?.user?.email ?? "").trim();
        }
        if (!email) throw new Error("This order has no customer email to put on the provider panel.");
        const made = await pp.panelCreateLine(panel, { username, email, packageId, note: `BM Support order ${order.order_ref ?? data.orderId}` });
        line = made;
        if (made.emailBumped) {
          await supabaseAdmin.from("user_notifications").insert({ user_id: OWNER_ID, kind: "mention", title: "Provider panel email already in use", body: `${email} was already on the provider panel, so order ${order.order_ref ?? data.orderId} (${made.username}) was created with ${made.email}.`, link_path: "/admin", source_type: "provider_panel" } as never);
        }
        }
      } else {
        const id = await pp.panelFindLine(panel, data.username!);
        if (!id) throw new Error(`Couldn't find ${data.username} on the provider panel.`);
        // Remember the expiry before buying, so a failed attempt can be safely retried later.
        const before = renewBefore || (await pp.readLine(panel, id)).exp;
        await save({ status: "submitted", panel_username: data.username, panel_line_id: id, exp_date: before || null });
        line = await pp.panelExtendLine(panel, { id, packageId });
      }
      await save({ status: "done", panel_username: line.username, panel_password: line.password, panel_line_id: line.id, exp_date: line.exp });
      await supabaseAdmin.from("checkout_chat_messages").insert({ order_id: data.orderId, sender: "staff", staff_id: context.userId, content: data.kind === "create" ? `Account created on the provider panel (${line.username}).` : `Account renewed on the provider panel (${line.username}) until ${line.exp}.` } as never);
      return { ok: true, username: line.username, password: line.password, exp: line.exp, again: false };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Provider panel error";
      console.error("provider panel", data.orderId, msg);
      await save({ status: "failed", error: msg });
      return { ok: false, error: msg };
    }
  });

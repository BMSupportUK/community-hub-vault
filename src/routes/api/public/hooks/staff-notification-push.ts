import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToRoles, pushToUser } from "@/lib/fcm.server";
import { broadcastToRoles, broadcastToUser } from "@/lib/push.functions";

// POST /api/public/hooks/staff-notification-push
// Called by an AFTER INSERT trigger on public.staff_notifications via pg_net.
// Loads the row and fans out a web push (browser/PWA) + FCM push (Android app)
// to the appropriate staff role group so new sales/orders, tickets, signups
// alert staff even when the app is backgrounded or fully closed.
//
// Auth: requires the Supabase anon/publishable key in the `apikey` header.

type StaffRole = "admin" | "management" | "staff" | "moderator";

function rolesForKind(kind: string): StaffRole[] {
  switch (kind) {
    case "order_placed":
      return ["admin", "management"];
    case "gate_application":
    case "gate_message":
      return ["admin", "management", "moderator"];

    case "ticket_raised":
      return ["admin", "management", "staff", "moderator"];
    default:
      return ["admin", "management"];
  }
}

function titlePrefix(kind: string): string {
  switch (kind) {
    case "order_placed":
      return "🛒 ";
    case "gate_application":
      return "👋 ";
    case "gate_message":
      return "💬 ";

    case "ticket_raised":
      return "🎫 ";
    default:
      return "";
  }
}

export const Route = createFileRoute("/api/public/hooks/staff-notification-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { id?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        if (!body.id) return new Response("Missing id", { status: 400 });

        const { data: row, error } = await supabaseAdmin
          .from("staff_notifications")
          .select("id, kind, title, body, link_path, entity_id")
          .eq("id", body.id)
          .maybeSingle();
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!row) return Response.json({ ok: true, skipped: "row not found" });

        const r = row as {
          id: string;
          kind: string;
          title: string;
          body: string | null;
          link_path: string | null;
          entity_id: string | null;
        };

        const roles = rolesForKind(r.kind);
        const title = `${titlePrefix(r.kind)}${r.title || "Staff notification"}`.slice(0, 200);
        const text = (r.body || "").slice(0, 300) || " ";
        const url = r.link_path || "/";
        const tag = `staff-${r.kind}-${r.id}`;

        try {
          if (r.kind === "ticket_raised") {
            // Tickets are claimed, not assigned: alert only staff on shift now.
            const { data: shifts } = await supabaseAdmin
              .from("shifts").select("user_id").is("clock_out", null).lte("clock_in", new Date().toISOString());
            const onShift = Array.from(new Set((shifts ?? []).map((s) => s.user_id as string)));
            const { data: roleRows } = onShift.length
              ? await supabaseAdmin.from("user_roles").select("user_id").in("user_id", onShift).in("role", roles)
              : { data: [] as { user_id: string }[] };
            const targets = Array.from(new Set((roleRows ?? []).map((x) => x.user_id)));
            let webSent = 0, fcmSent = 0;
            await Promise.all(targets.map(async (uid) => {
              const [w, f] = await Promise.all([
                broadcastToUser(uid, title, text, url, tag, undefined, r.kind).catch(() => ({ sent: 0 })),
                pushToUser(uid, { title, body: text, data: { kind: r.kind, notificationId: r.id, url, ...(r.entity_id ? { entityId: r.entity_id } : {}) } }).catch(() => ({ sent: 0, failed: 0 })),
              ]);
              webSent += w.sent; fcmSent += f.sent;
            }));
            await supabaseAdmin.from("notification_log").insert({
              kind: r.kind, channel: "push", target_id: r.id,
              status: webSent > 0 || fcmSent > 0 ? "sent" : "skipped",
              message: `staff_push on_shift=${targets.length} web=${webSent} fcm=${fcmSent}`,
            } as never);
            return Response.json({ ok: true, onShift: targets.length, web: webSent, fcm: fcmSent });
          }
          const [web, fcm] = await Promise.all([
            broadcastToRoles(roles, title, text, url, tag, r.kind).catch((e) => ({
              sent: 0,
              error: e instanceof Error ? e.message : String(e),
            })),
            pushToRoles(roles, {
              title,
              body: text,
              data: {
                kind: r.kind,
                notificationId: r.id,
                url,
                ...(r.entity_id ? { entityId: r.entity_id } : {}),
              },
            }).catch((e) => ({
              sent: 0,
              failed: 0,
              error: e instanceof Error ? e.message : String(e),
            })),
          ]);

          await supabaseAdmin.from("notification_log").insert({
            kind: r.kind,
            channel: "push",
            target_id: r.id,
            status: web.sent > 0 || fcm.sent > 0 ? "sent" : "skipped",
            message: `staff_push roles=${roles.join(",")} web=${web.sent} fcm=${fcm.sent} failed=${"failed" in fcm ? fcm.failed : 0}`,
            error:
              ["error" in web ? web.error : null, "error" in fcm ? fcm.error : null]
                .filter(Boolean)
                .join(" | ") || null,
          } as never);

          return Response.json({ ok: true, web, fcm });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("notification_log").insert({
            kind: r.kind,
            channel: "push",
            target_id: r.id,
            status: "failed",
            message: "staff_push",
            error: msg,
          } as never);
          return Response.json({ ok: false, error: msg }, { status: 502 });
        }
      },
    },
  },
});
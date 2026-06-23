import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToRoles } from "@/lib/fcm.server";
import { broadcastToRoles } from "@/lib/push.functions";

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
          const [web, fcm] = await Promise.all([
            broadcastToRoles(roles, title, text, url, tag).catch((e) => ({
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
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToAllDevices } from "@/lib/fcm.server";
import { broadcast } from "@/lib/push.functions";

// POST /api/public/hooks/status-incident-push
// Called by AFTER INSERT / AFTER UPDATE triggers on public.status_incidents
// via pg_net. Sends a web push (browser/PWA) + FCM push (Android app) to
// every subscriber so new outages and resolved outages alert users even
// when the app is backgrounded or closed.
//
// Auth: requires the Supabase anon/publishable key in the `apikey` header.

export const Route = createFileRoute("/api/public/hooks/status-incident-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { id?: string; kind?: "created" | "resolved" };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        if (!body.id || (body.kind !== "created" && body.kind !== "resolved")) {
          return new Response("Missing/invalid id or kind", { status: 400 });
        }

        const { data: row, error } = await supabaseAdmin
          .from("status_incidents")
          .select("id, title, description")
          .eq("id", body.id)
          .maybeSingle();
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!row) return Response.json({ ok: true, skipped: "row not found" });

        const r = row as { id: string; title: string | null; description: string | null };

        const title =
          body.kind === "created"
            ? `🚨 New outage: ${r.title ?? "Incident reported"}`
            : `✅ Outage resolved: ${r.title ?? "Incident"}`;
        const text =
          (r.description || "").trim().slice(0, 300) ||
          (body.kind === "created"
            ? "An outage has been reported."
            : "The outage has been resolved.");
        const url = "/status";
        const tag = `incident-${r.id}-${body.kind}`;

        try {
          const [web, fcm] = await Promise.all([
            broadcast(title, text, url, tag).catch((e) => ({
              sent: 0,
              error: e instanceof Error ? e.message : String(e),
            })),
            pushToAllDevices({
              title,
              body: text,
              data: { kind: "incident", incidentId: r.id, event: body.kind, url },
            }).catch((e) => ({
              sent: 0,
              failed: 0,
              error: e instanceof Error ? e.message : String(e),
            })),
          ]);

          await supabaseAdmin.from("notification_log").insert({
            kind: `incident_${body.kind}`,
            channel: "push",
            target_id: r.id,
            status: web.sent > 0 || fcm.sent > 0 ? "sent" : "skipped",
            message: `incident_push web=${web.sent} fcm=${fcm.sent} failed=${"failed" in fcm ? fcm.failed : 0}`,
            error:
              ["error" in web ? web.error : null, "error" in fcm ? fcm.error : null]
                .filter(Boolean)
                .join(" | ") || null,
          } as never);

          return Response.json({ ok: true, web, fcm });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("notification_log").insert({
            kind: `incident_${body.kind}`,
            channel: "push",
            target_id: r.id,
            status: "failed",
            message: "incident_push",
            error: msg,
          } as never);
          return Response.json({ ok: false, error: msg }, { status: 502 });
        }
      },
    },
  },
});
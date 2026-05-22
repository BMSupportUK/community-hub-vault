import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToUser } from "@/lib/fcm.server";

// POST /api/public/hooks/user-notification-push
// Called by an AFTER INSERT trigger on public.user_notifications via pg_net.
// Loads the row and sends an FCM push to all devices belonging to the row's user.
// This is what makes ticket assignments, mentions, ticket help, friend requests,
// etc. play a sound on Android when the app is closed/backgrounded.
//
// Auth: requires the Supabase anon key in the `apikey` header.

export const Route = createFileRoute("/api/public/hooks/user-notification-push")({
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
          .from("user_notifications")
          .select("id, user_id, kind, title, body, link_path")
          .eq("id", body.id)
          .maybeSingle();
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!row) return Response.json({ ok: true, skipped: "row not found" });

        const r = row as {
          id: string;
          user_id: string;
          kind: string;
          title: string;
          body: string | null;
          link_path: string | null;
        };

        // Strip the trailing requester id marker the ticket_help RPC adds for cooldown tracking
        const cleanBody = (r.body || "").replace(/\s*\[[0-9a-f-]{36}\]\s*$/i, "").slice(0, 300);

        try {
          const res = await pushToUser(r.user_id, {
            title: r.title || "Notification",
            body: cleanBody || " ",
            data: {
              kind: r.kind,
              notificationId: r.id,
              url: r.link_path || "/",
            },
          });
          await supabaseAdmin.from("notification_log").insert({
            kind: r.kind,
            channel: "push",
            target_id: r.id,
            status: res.sent > 0 ? "sent" : "skipped",
            message: `user_push: sent=${res.sent} failed=${res.failed}${res.skipped ? " (" + res.skipped + ")" : ""}`,
            error: null,
          } as never);
          return Response.json({ ok: true, ...res });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("notification_log").insert({
            kind: r.kind,
            channel: "push",
            target_id: r.id,
            status: "failed",
            message: "user_push",
            error: msg,
          } as never);
          return Response.json({ ok: false, error: msg }, { status: 502 });
        }
      },
    },
  },
});
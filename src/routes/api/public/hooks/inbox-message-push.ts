import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { pushToUser } from "@/lib/fcm.server";
import { broadcastToUser } from "@/lib/push.functions";

// POST /api/public/hooks/inbox-message-push
// Called by an AFTER INSERT trigger on public.bm_inbox_messages via pg_net.
// Sends a push to the recipient of a BM Support inbox DM so the Android app
// dings even when closed. Uses the default alerts channel (system ding) —
// DMs are not spoken alerts.
//
// Auth: requires CRON_SECRET in the `x-cron-secret` header.

export const Route = createFileRoute("/api/public/hooks/inbox-message-push")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SECRET;
        const provided = request.headers.get("x-cron-secret");
        if (!expected || !provided || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        let body: { id?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        if (!body.id) return new Response("Missing id", { status: 400 });

        const { data: msg, error } = await supabaseAdmin
          .from("bm_inbox_messages")
          .select("id, thread_id, sender_id, body")
          .eq("id", body.id)
          .maybeSingle();
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        if (!msg) return Response.json({ ok: true, skipped: "message not found" });

        const { data: thread, error: tErr } = await supabaseAdmin
          .from("bm_inbox_threads")
          .select("user_low, user_high")
          .eq("id", msg.thread_id)
          .maybeSingle();
        if (tErr) return Response.json({ ok: false, error: tErr.message }, { status: 500 });
        if (!thread) return Response.json({ ok: true, skipped: "thread not found" });

        const recipient = thread.user_low === msg.sender_id ? thread.user_high : thread.user_low;

        const { data: sender } = await supabaseAdmin
          .from("profiles")
          .select("display_name, username")
          .eq("id", msg.sender_id)
          .maybeSingle();
        const senderName = sender?.display_name || sender?.username || "Someone";

        const preview = (msg.body || "").replace(/\s+/g, " ").trim().slice(0, 200);
        const url = "/inbox";
        try {
          const [fcm, web] = await Promise.all([
            pushToUser(recipient, {
              title: `Message from ${senderName}`,
              body: preview || "Open BM Support to read it.",
              data: { kind: "dm", messageId: msg.id, url },
            }),
            broadcastToUser(recipient, `Message from ${senderName}`, preview || " ", url, `dm-${msg.id}`, undefined, "dm")
              .catch((e) => ({ sent: 0, error: e instanceof Error ? e.message : String(e) })),
          ]);
          await supabaseAdmin.from("notification_log").insert({
            kind: "dm",
            channel: "push",
            target_id: msg.id,
            status: fcm.sent > 0 || web.sent > 0 ? "sent" : "skipped",
            message: `dm_push: fcm=${fcm.sent} failed=${fcm.failed}${fcm.skipped ? " (" + fcm.skipped + ")" : ""} web=${web.sent}${"error" in web && web.error ? " (" + web.error + ")" : ""}`,
            error: null,
          } as never);
          return Response.json({ ok: true, ...fcm, web: web.sent });
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          await supabaseAdmin.from("notification_log").insert({
            kind: "dm",
            channel: "push",
            target_id: msg.id,
            status: "failed",
            message: "dm_push",
            error: errMsg,
          } as never);
          return Response.json({ ok: false, error: errMsg }, { status: 502 });
        }
      },
    },
  },
});

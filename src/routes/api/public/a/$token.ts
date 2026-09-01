import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// GET /api/public/a/:token
// Streams the current APK to a device that presents a live transfer token.
// The Downloader app on Fire OS is not signed in, so the token itself is the
// credential: unknown, deleted or expired tokens get a bare 404.

const SAFE_TOKEN = /^[A-Za-z0-9]{6,16}$/;

export const Route = createFileRoute("/api/public/a/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = (params.token ?? "").toUpperCase();
        if (!SAFE_TOKEN.test(token)) return new Response("Not found", { status: 404 });

        const nowIso = new Date().toISOString();
        const { data: transfer } = await supabaseAdmin
          .from("app_transfers")
          .select("id, build_id, expires_at, download_count, last_download_started_at")
          .eq("token", token)
          .gt("expires_at", nowIso)
          .maybeSingle();
        if (!transfer) return new Response("Not found", { status: 404 });

        const { data: build } = await supabaseAdmin
          .from("app_builds")
          .select("file_path, file_name, is_available")
          .eq("id", transfer.build_id)
          .maybeSingle();
        if (!build || !build.is_available) return new Response("Not found", { status: 404 });

        const { data: file, error } = await supabaseAdmin.storage
          .from("app-builds")
          .download(build.file_path);
        if (error || !file) return new Response("Not found", { status: 404 });

        const totalBytes = file.size ?? null;

        // Count one download every time a file transfer actually starts from
        // the beginning, whatever client is used. Range resumes/retries of an
        // in-flight download are continuations, not new downloads.
        const rangeHeader = request.headers.get("range");
        const isRangeContinuation = !!rangeHeader && !/^bytes=0-/.test(rangeHeader);

        await supabaseAdmin
          .from("app_transfers")
          .update({
            download_count:
              (transfer.download_count ?? 0) + (isRangeContinuation ? 0 : 1),

            last_download_at: nowIso,
            last_download_started_at: nowIso,
            last_download_status: "downloading",
            last_download_bytes: 0,
            last_download_total_bytes: totalBytes,
          })
          .eq("id", transfer.id);


        // Count bytes as they stream so staff can watch live progress.
        let sent = 0;
        let lastReported = 0;
        const progress = new TransformStream<Uint8Array, Uint8Array>({
          async transform(chunk, controller) {
            controller.enqueue(chunk);
            sent += chunk.byteLength;
            if (sent - lastReported >= 256 * 1024) {
              lastReported = sent;
              await supabaseAdmin
                .from("app_transfers")
                .update({ last_download_bytes: sent, last_download_status: "downloading" })
                .eq("id", transfer.id);
            }
          },
          async flush() {
            await supabaseAdmin
              .from("app_transfers")
              .update({
                last_download_bytes: sent,
                last_download_status:
                  totalBytes && sent < totalBytes ? "incomplete" : "completed",
                last_download_at: new Date().toISOString(),
              })
              .eq("id", transfer.id);
          },
        });

        const name = (build.file_name || "BMSupport.apk").replace(/[^\w.\-]/g, "_");
        return new Response(file.stream().pipeThrough(progress), {
          status: 200,
          headers: {
            "Content-Type": "application/vnd.android.package-archive",
            "Content-Disposition": `attachment; filename="${name}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});

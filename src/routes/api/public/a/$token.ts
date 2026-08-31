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
      GET: async ({ params }) => {
        const token = (params.token ?? "").toUpperCase();
        if (!SAFE_TOKEN.test(token)) return new Response("Not found", { status: 404 });

        const nowIso = new Date().toISOString();
        const { data: transfer } = await supabaseAdmin
          .from("app_transfers")
          .select("id, build_id, expires_at, download_count")
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

        await supabaseAdmin
          .from("app_transfers")
          .update({
            download_count: (transfer.download_count ?? 0) + 1,
            last_download_at: nowIso,
          })
          .eq("id", transfer.id);

        const name = (build.file_name || "BMSupport.apk").replace(/[^\w.\-]/g, "_");
        return new Response(file.stream(), {
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
